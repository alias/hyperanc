/**
 * GEDCOM Writer
 * Exports data to GEDCOM 5.5.1 or 7.0 format.
 */

/**
 * Export data to GEDCOM text.
 * @param {object} data - { individuals: Map, families: Map, homePersonId }
 * @param {string} version - '5.5.1' or '7.0'
 * @returns {string} GEDCOM text
 */
export function exportGedcom(data, version = '5.5.1') {
  const lines = [];

  // --- HEAD ---
  lines.push('0 HEAD');
  lines.push('1 SOUR ROOTS');
  lines.push('2 VERS 1.0');
  lines.push('2 NAME Roots Ancestry Viewer');
  const now = new Date();
  const dateStr = `${now.getDate()} ${['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][now.getMonth()]} ${now.getFullYear()}`;
  lines.push(`1 DATE ${dateStr}`);
  lines.push('1 GEDC');
  lines.push(`2 VERS ${version}`);
  if (version === '5.5.1') {
    lines.push('2 FORM LINEAGE-LINKED');
    lines.push('1 CHAR UTF-8');
  }
  if (data.homePersonId) {
    lines.push(`1 _HOME ${data.homePersonId}`);
  }

  // --- INDIVIDUALS ---
  for (const [id, indi] of data.individuals) {
    lines.push(`0 ${id} INDI`);

    // NAME
    const surname = indi.surname || '';
    const given = indi.givenName || '';
    if (given || surname) {
      lines.push(`1 NAME ${given} /${surname}/`);
      if (given) lines.push(`2 GIVN ${given}`);
      if (surname) lines.push(`2 SURN ${surname}`);
    }

    // SEX
    if (indi.sex) {
      lines.push(`1 SEX ${indi.sex}`);
    }

    // BIRT
    if (indi.birthDate || indi.birthPlace) {
      lines.push('1 BIRT');
      if (indi.birthDate) lines.push(`2 DATE ${indi.birthDate}`);
      if (indi.birthPlace) lines.push(`2 PLAC ${indi.birthPlace}`);
    }

    // DEAT
    if (indi.deathDate || indi.deathPlace) {
      lines.push('1 DEAT');
      if (indi.deathDate) lines.push(`2 DATE ${indi.deathDate}`);
      if (indi.deathPlace) lines.push(`2 PLAC ${indi.deathPlace}`);
    }

    // OCCU
    if (indi.occupation) {
      lines.push(`1 OCCU ${indi.occupation}`);
    }

    // FAMS
    for (const famId of indi.familiesAsSpouse) {
      lines.push(`1 FAMS ${famId}`);
    }

    // FAMC
    if (indi.familyAsChild) {
      lines.push(`1 FAMC ${indi.familyAsChild}`);
    }
  }

  // --- FAMILIES ---
  for (const [id, fam] of data.families) {
    lines.push(`0 ${id} FAM`);

    if (fam.husbandId) lines.push(`1 HUSB ${fam.husbandId}`);
    if (fam.wifeId) lines.push(`1 WIFE ${fam.wifeId}`);

    for (const childId of fam.childIds) {
      lines.push(`1 CHIL ${childId}`);
    }

    if (fam.marriageDate || fam.marriagePlace) {
      lines.push('1 MARR');
      if (fam.marriageDate) lines.push(`2 DATE ${fam.marriageDate}`);
      if (fam.marriagePlace) lines.push(`2 PLAC ${fam.marriagePlace}`);
    }
  }

  // --- TRAILER ---
  lines.push('0 TRLR');

  return lines.join('\n');
}
