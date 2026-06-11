import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

type MatchRow = {
  group_name: string;
  team_home: string;
  team_away: string;
  kickoff_time: string;
};

const [, , inputPath, outputPath] = process.argv;

if (!inputPath) {
  console.error('Usage: node --experimental-strip-types scripts/import-worldcup-matches.ts matches.csv [output.sql]');
  process.exit(1);
}

const parseCsv = (content: string) => {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      row.push(current.trim());
      current = '';
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current || row.length > 0) {
    row.push(current.trim());
    if (row.some(Boolean)) {
      rows.push(row);
    }
  }

  return rows;
};

const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`;

const resolvedInputPath = resolve(inputPath);

if (!existsSync(resolvedInputPath)) {
  console.error(`CSV file not found: ${resolvedInputPath}`);
  process.exit(1);
}

const input = readFileSync(resolvedInputPath, 'utf8');
const rows = parseCsv(input);
const [headers, ...records] = rows;
const requiredHeaders = ['group_name', 'team_home', 'team_away', 'kickoff_time'];

if (!headers || requiredHeaders.some((header) => !headers.includes(header))) {
  console.error(`CSV must include headers: ${requiredHeaders.join(', ')}`);
  process.exit(1);
}

const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
const matches: MatchRow[] = records.map((record) => ({
  group_name: record[headerIndex.group_name],
  team_home: record[headerIndex.team_home],
  team_away: record[headerIndex.team_away],
  kickoff_time: record[headerIndex.kickoff_time],
}));

const invalidRow = matches.find(
  (match) => !match.group_name || !match.team_home || !match.team_away || Number.isNaN(Date.parse(match.kickoff_time)),
);

if (invalidRow) {
  console.error('Invalid row found. Ensure group_name, team_home, team_away, and kickoff_time are valid.');
  console.error(invalidRow);
  process.exit(1);
}

const values = matches
  .map(
    (match) =>
      `  (${sqlString(match.group_name)}, ${sqlString(match.team_home)}, ${sqlString(match.team_away)}, ${sqlString(
        new Date(match.kickoff_time).toISOString(),
      )}::timestamptz)`,
  )
  .join(',\n');

const sql = `-- Generated from ${basename(inputPath)}. Triggers create match_winner markets automatically.\ninsert into public.wc_matches (group_name, team_home, team_away, kickoff_time)\nvalues\n${values}\non conflict (group_name, team_home, team_away, kickoff_time) do update\nset\n  team_home = excluded.team_home,\n  team_away = excluded.team_away,\n  kickoff_time = excluded.kickoff_time;\n`;

if (outputPath) {
  writeFileSync(resolve(outputPath), sql);
  console.log(`Wrote ${matches.length} matches to ${outputPath}`);
} else {
  console.log(sql);
}
