import { ALL_OCCUPATIONS, ALL_TALENT_TREES, ALL_TRAITS, validateGameplayContent } from '../src/index';

const report = validateGameplayContent(ALL_TRAITS, ALL_OCCUPATIONS, ALL_TALENT_TREES);

if (report.issues.length > 0) {
  console.error(`Gameplay content validation found ${report.summary.errorCount} errors and ${report.summary.warningCount} warnings.`);
  report.issues.forEach((issue) => {
    const prefix = issue.level === 'error' ? 'ERROR' : 'WARN';
    console.error(`${prefix} [${issue.category}] ${issue.id}: ${issue.message}`);
  });
}

if (report.summary.errorCount > 0) {
  process.exit(1);
}

console.log(`Gameplay content validation passed with ${report.summary.warningCount} warnings.`);
