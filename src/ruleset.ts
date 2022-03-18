import fs from 'fs';
import path from 'path';
import { info } from '@actions/core';
import { Ruleset, RulesetDefinition } from '@stoplight/spectral-core';
import { migrateRuleset } from '@stoplight/spectral-ruleset-migrator';

const AsyncFunction = (async (): Promise<void> => void 0).constructor as FunctionConstructor;

export async function getRuleset(dir: string, file?: string): Promise<Ruleset> {
  if (!file) {
    file = await getDefaultRulesetFile(dir);
  } else if (!path.isAbsolute(file)) {
    file = path.join(process.cwd(), file);
  }

  let ruleset;

  if (!file) {
    info(`Using default ruleset`);
    file = path.join(__dirname, 'default.yaml');
  }

  if (/(json|ya?ml)$/.test(path.extname(file))) {
    info(`Loading basic ruleset from ${file}`);

    const m: { exports?: RulesetDefinition } = {};
    const paths = [path.dirname(file), __dirname, dir];

    const migratedRuleset = await migrateRuleset(file, { format: 'commonjs', fs });
    await AsyncFunction('module, require', migratedRuleset)(m, (id: string) => require(require.resolve(id, { paths })));

    ruleset = m.exports;
  } else {
    info(`Loading JS ruleset from ${file}`);

    const imported = (await import(file)) as { default: unknown } | unknown;
    ruleset =
      typeof imported === 'object' && imported !== null && 'default' in imported
        ? (imported as Record<'default', unknown>).default
        : imported;
  }

  return new Ruleset(ruleset, {
    severity: 'recommended',
    source: file,
  });
}

async function getDefaultRulesetFile(dir: string): Promise<string | undefined> {
  const filenames = await fs.promises.readdir(dir);

  for (const filename of filenames) {
    if (Ruleset.isDefaultRulesetFile(filename)) {
      return path.join(dir, filename);
    }
  }

  return;
}
