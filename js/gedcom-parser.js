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
          familyAsChild: null,
          images: [] // [{file, form, title}]
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
          case 'OBJE':
            currentSubTag = 'OBJE';
            currentRecord.images.push({ file: '', form: '', title: '' });
            break;
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
        } else if (currentSubTag === 'OBJE') {
          const img = currentRecord.images[currentRecord.images.length - 1];
          if (img) {
            if (tag === 'FILE') img.file = value;
            else if (tag === 'FORM') img.form = value;
            else if (tag === 'TITL') img.title = value;
          }
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

const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

/**
 * Convert GEDCOM date to German format dd.MM.yyyy.
 * Handles: "2 JUL 1934" -> "02.07.1934", "1965" -> "1965", "ABT 1800" -> "ca. 1800"
 */
export function formatDate(gedcomDate) {
  if (!gedcomDate) return '';
  let d = gedcomDate.trim();

  // Handle prefixes
  let prefix = '';
  if (d.startsWith('ABT ')) { prefix = 'ca. '; d = d.substring(4); }
  else if (d.startsWith('BEF ')) { prefix = 'vor '; d = d.substring(4); }
  else if (d.startsWith('AFT ')) { prefix = 'nach '; d = d.substring(4); }
  else if (d.startsWith('EST ')) { prefix = 'ca. '; d = d.substring(4); }
  else if (d.startsWith('CAL ')) { prefix = 'ca. '; d = d.substring(4); }

  // Full date: "2 JUL 1934" or "02 JUL 1934"
  const full = d.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/);
  if (full) {
    const day = full[1].padStart(2, '0');
    const month = MONTHS[full[2]] || full[2];
    return `${prefix}${day}.${month}.${full[3]}`;
  }

  // Month + year: "JUL 1934"
  const monthYear = d.match(/^([A-Z]{3})\s+(\d{4})$/);
  if (monthYear) {
    const month = MONTHS[monthYear[1]] || monthYear[1];
    return `${prefix}${month}.${monthYear[2]}`;
  }

  // Year only: "1934"
  const yearOnly = d.match(/^(\d{4})$/);
  if (yearOnly) {
    return `${prefix}${yearOnly[1]}`;
  }

  // Fallback
  return prefix + d;
}

/**
 * Parse GEDCOM date to a JS Date (for age calculation).
 * Returns Date or null.
 */
export function parseDate(gedcomDate) {
  if (!gedcomDate) return null;
  let d = gedcomDate.replace(/^(ABT|BEF|AFT|EST|CAL)\s+/, '');

  const full = d.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/);
  if (full) {
    const month = parseInt(MONTHS[full[2]] || '1') - 1;
    return new Date(parseInt(full[3]), month, parseInt(full[1]));
  }

  const monthYear = d.match(/^([A-Z]{3})\s+(\d{4})$/);
  if (monthYear) {
    const month = parseInt(MONTHS[monthYear[1]] || '1') - 1;
    return new Date(parseInt(monthYear[2]), month, 1);
  }

  const yearOnly = d.match(/^(\d{4})$/);
  if (yearOnly) {
    return new Date(parseInt(yearOnly[1]), 0, 1);
  }

  return null;
}

/**
 * Calculate age in whole years.
 * If death date given, age at death. Otherwise age today (if born before today).
 * Returns number or null.
 */
export function getAge(individual) {
  const birth = parseDate(individual.birthDate);
  if (!birth) return null;

  const end = parseDate(individual.deathDate) || new Date();
  let age = end.getFullYear() - birth.getFullYear();
  const monthDiff = end.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

export function getDisplayName(individual) {
  const given = individual.givenName || '';
  const sur = individual.surname || '';
  if (given && sur) return `${given} ${sur}`;
  return given || sur || '(Unbekannt)';
}

export function getLifespan(individual) {
  const b = formatDate(individual.birthDate);
  const d = formatDate(individual.deathDate);
  if (b && d) return `${b} - ${d}`;
  if (b) return `* ${b}`;
  if (d) return `+ ${d}`;
  return '';
}
