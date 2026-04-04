/**
 * GEDCOM Parser
 * Parses GEDCOM 5.5.1 and 7.0 text into individuals and families maps.
 * Auto-detects version from header.
 */

/**
 * Detect GEDCOM version from text.
 * @returns {'7.0'|'5.5.1'}
 */
export function detectVersion(text) {
  // Look for version in first ~50 lines
  const headerLines = text.split(/\r?\n/).slice(0, 50);
  for (const line of headerLines) {
    const trimmed = line.trim();
    if (/^2\s+VERS\s+7/i.test(trimmed)) return '7.0';
    if (/^2\s+VERS\s+5/i.test(trimmed)) return '5.5.1';
  }
  return '5.5.1'; // default
}

/**
 * Parse GEDCOM text (auto-detects version).
 * Both 5.5.1 and 7.0 produce the same data model.
 */
export function parseGedcom(text) {
  const version = detectVersion(text);
  const lines = text.split(/\r?\n/);
  const individuals = new Map();
  const families = new Map();
  let homePersonId = null;

  let currentRecord = null;
  let currentSubTag = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // GEDCOM 7.0 may use @XREF@ before or after tag
    // 5.5.1: "0 @I1@ INDI"
    // 7.0:   "0 @I1@ INDI" (same) or potentially different ordering
    const match = trimmed.match(/^(\d+)\s+(@[\w]+@)?\s*(\w+)\s*(.*)?$/);
    if (!match) continue;

    const level = parseInt(match[1]);
    const xref = match[2] || null;
    const tag = match[3];
    const value = (match[4] || '').trim();

    if (level === 0) {
      currentRecord = null;
      currentSubTag = null;

      if (xref && tag === 'INDI') {
        currentRecord = {
          type: 'INDI',
          id: xref,
          givenName: '',
          surname: '',
          sex: '',
          birthDate: '',
          birthPlace: '',
          deathDate: '',
          deathPlace: '',
          occupation: '',
          familiesAsSpouse: [],
          familyAsChild: null
        };
        individuals.set(xref, currentRecord);
      } else if (xref && tag === 'FAM') {
        currentRecord = {
          type: 'FAM',
          id: xref,
          husbandId: null,
          wifeId: null,
          childIds: [],
          marriageDate: '',
          marriagePlace: ''
        };
        families.set(xref, currentRecord);
      }
      continue;
    }

    if (!currentRecord) {
      // Header-level tags
      if (level === 1 && tag === '_HOME') {
        homePersonId = value;
      }
      continue;
    }

    if (currentRecord.type === 'INDI') {
      if (level === 1) {
        currentSubTag = tag;
        switch (tag) {
          case 'GIVN': currentRecord.givenName = value; break;
          case 'SURN': currentRecord.surname = value; break;
          case 'SEX': currentRecord.sex = value; break;
          case 'OCCU': currentRecord.occupation = value; break;
          case 'FAMS': currentRecord.familiesAsSpouse.push(value); break;
          case 'FAMC': currentRecord.familyAsChild = value; break;
          case 'BIRT': currentSubTag = 'BIRT'; break;
          case 'DEAT': currentSubTag = 'DEAT'; break;
          case 'CHR': currentSubTag = 'CHR'; break;
          case 'BURI': currentSubTag = 'BURI'; break;
          case 'NAME':
            currentSubTag = 'NAME';
            const nameMatch = value.match(/^(.+?)\s*\/(.+?)\//);
            if (nameMatch) {
              currentRecord.givenName = currentRecord.givenName || nameMatch[1].trim();
              currentRecord.surname = currentRecord.surname || nameMatch[2].trim();
            } else {
              currentRecord.givenName = currentRecord.givenName || value.replace(/\//g, '').trim();
            }
            break;
        }
      } else if (level === 2) {
        if (currentSubTag === 'BIRT') {
          if (tag === 'DATE') currentRecord.birthDate = value;
          else if (tag === 'PLAC') currentRecord.birthPlace = value;
        } else if (currentSubTag === 'DEAT') {
          if (tag === 'DATE') currentRecord.deathDate = value;
          else if (tag === 'PLAC') currentRecord.deathPlace = value;
        } else if (currentSubTag === 'NAME') {
          if (tag === 'GIVN') currentRecord.givenName = value;
          else if (tag === 'SURN') currentRecord.surname = value;
        }
      }
    } else if (currentRecord.type === 'FAM') {
      if (level === 1) {
        currentSubTag = tag;
        switch (tag) {
          case 'HUSB': currentRecord.husbandId = value; break;
          case 'WIFE': currentRecord.wifeId = value; break;
          case 'CHIL': currentRecord.childIds.push(value); break;
          case 'MARR': currentSubTag = 'MARR'; break;
        }
      } else if (level === 2 && currentSubTag === 'MARR') {
        if (tag === 'DATE') currentRecord.marriageDate = value;
        else if (tag === 'PLAC') currentRecord.marriagePlace = value;
      }
    }
  }

  // Clean up unknown surnames
  for (const [, indi] of individuals) {
    if (indi.surname === '?' || indi.surname === '...') {
      indi.surname = '';
    }
  }

  return { individuals, families, homePersonId, version };
}

export function getDisplayName(individual) {
  const given = individual.givenName || '';
  const sur = individual.surname || '';
  if (given && sur) return `${given} ${sur}`;
  return given || sur || '(Unbekannt)';
}

export function getLifespan(individual) {
  const b = individual.birthDate || '';
  const d = individual.deathDate || '';
  if (b && d) return `${b} - ${d}`;
  if (b) return `* ${b}`;
  if (d) return `+ ${d}`;
  return '';
}
