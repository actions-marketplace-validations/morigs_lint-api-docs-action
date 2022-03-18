import path from 'path';
import fs from 'fs/promises';
import { info, error, warning, notice, getInput, setFailed, AnnotationProperties } from '@actions/core';
import { DiagnosticSeverity } from '@stoplight/types';
import { Spectral, Document, ISpectralDiagnostic, getDiagnosticSeverity, HumanReadableDiagnosticSeverity } from '@stoplight/spectral-core';
import { httpAndFileResolver } from '@stoplight/spectral-ref-resolver';
import * as Parsers from '@stoplight/spectral-parsers';
import glob from 'glob';
import { getRuleset } from './ruleset';

const FILES_GLOB_INPUT = 'files-glob';
const RULESET_FILE_PATH_INPUT = 'ruleset-file';
const FAIL_SEVERITY_INPUT = 'fail-severity';
const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();

main()
  .then(() => info('Success'))
  .catch(setFailed);

async function main() {
  const filesGlob = getInput(FILES_GLOB_INPUT);
  const rulesetPath = getInput(RULESET_FILE_PATH_INPUT);
  const failSeverity = getDiagnosticSeverity(getInput(FAIL_SEVERITY_INPUT) as HumanReadableDiagnosticSeverity);

  const spectral = new Spectral({ resolver: httpAndFileResolver });
  spectral.setRuleset(await getRuleset(workspace, rulesetPath));

  const loadedRules = Object.values(spectral.ruleset!.rules);
  const enabledRules = loadedRules.filter(r => r.enabled);

  info(`Enabled rules: ${enabledRules.map((r) => r.name).join(', ')}`);

  const filesPaths = await getFilesPaths(filesGlob);
  const files = await Promise.all(filesPaths.map((p) => fs.readFile(p, { encoding: 'utf8' })));

  let shouldFail = false;

  for (let i = 0; i < files.length; i++) {
    const issues = await lintFile(spectral, files[i], filesPaths[i]);
    issues.forEach((iss) => addAnnotation(iss, files[i], filesPaths[i]));
    if (!shouldFail && issues.some((iss) => iss.severity <= failSeverity)) shouldFail = true;
  }

  if (shouldFail) {
    setFailed(`There are problems with severity higher than ${failSeverity}.`);
  }
}

async function lintFile(spectral: Spectral, contents: string, path: string): Promise<ISpectralDiagnostic[]> {
  return await spectral.run(new Document(contents, Parsers.Yaml, path), {
    ignoreUnknownFormat: false,
  })
}

function getFilesPaths(filesGlob: string): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => glob(filesGlob, (err, matches) => {
    if (err) reject(err);
    else resolve(matches);
  }));
}

function addAnnotation(issue: ISpectralDiagnostic, contents: string, filePath: string) {
  const sameLine = issue.range.start.line === issue.range.end.line;
  const props: AnnotationProperties = {
    title: String(issue.code),
    startLine: 1 + issue.range.start.line,
    endLine: 1 + issue.range.start.line,
    startColumn: sameLine ? issue.range.start.character : undefined,
    endColumn: sameLine ? issue.range.end.character : undefined,
    file: path.relative(workspace, issue.source ?? filePath),
  };

  switch (issue.severity) {
  case DiagnosticSeverity.Hint:
  case DiagnosticSeverity.Information:
    notice(issue.message, props);
    break;
  case DiagnosticSeverity.Warning:
    warning(issue.message, props);
    break;
  default:
    error(issue.message, props);
  }
}

export const severeEnoughToFail = (results: ISpectralDiagnostic[], failSeverity: DiagnosticSeverity): boolean => {
  return results.some(r => r.severity <= failSeverity);
}
