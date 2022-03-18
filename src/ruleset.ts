import fs from 'fs';
import path from 'path';
import { info, error } from '@actions/core';
import { Ruleset, RulesetDefinition } from '@stoplight/spectral-core';
import { migrateRuleset } from '@stoplight/spectral-ruleset-migrator';

const AsyncFunction = (async (): Promise<void> => void 0).constructor as FunctionConstructor;

const defaultRuleset = { extends: ['spectral:oas', 'spectral:asyncapi'] };

export async function getRuleset(dir: string, file?: string): Promise<Ruleset> {
  if (!file) {
    file = await getDefaultRulesetFile(dir);
  } else if (!path.isAbsolute(file)) {
    file = path.join(process.cwd(), file);
  }

  if (!file) {
    info(`Using default ruleset`);

    return new Ruleset(defaultRuleset, { severity: 'recommended' });
  }

  info(`Loading ruleset from ${file}`);


  try {
    let ruleset;

    if (/(json|ya?ml)$/.test(path.extname(file))) {
      const m: { exports?: RulesetDefinition } = {};
      const paths = [path.dirname(file), __dirname];

      const migratedRuleset = await migrateRuleset(file, { format: 'commonjs', fs });
      await AsyncFunction('module, require', migratedRuleset)(m, (id: string) => require(require.resolve(id, { paths })));

      ruleset = m.exports;
    } else {
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
  } catch (e) {
    error(`Failed to load ruleset '${file}'... Error: ${(e as Error).message}`);
    throw e;
  }
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
