import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../src/data');
const traitsPath = path.join(dataDir, 'traits.json');
const occupationsPath = path.join(dataDir, 'occupations.json');
const talentTreesPath = path.join(dataDir, 'talentTrees.json');

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function generatedBaselineTraitId(occupationId) {
  return `trait-${occupationId}-base`;
}

function generatedNodeTraitId(occupationId, nodeId) {
  return `trait-${occupationId}-${nodeId}`;
}

function buildGeneratedTrait({
  id,
  name,
  description,
  effects,
  grantsSkillIds,
  icon,
  source,
  existing,
}) {
  const next = {
    id,
    name,
    description,
    cost: 0,
    type: 'neutral',
    source,
  };

  const nextEffects = effects?.length ? clone(effects) : clone(existing?.effects);
  if (nextEffects?.length) {
    next.effects = nextEffects;
  }
  const nextGrantedSkillIds = grantsSkillIds?.length
    ? [...new Set(grantsSkillIds)]
    : [...new Set(existing?.grantsSkillIds || [])];
  if (nextGrantedSkillIds.length) {
    next.grantsSkillIds = nextGrantedSkillIds;
  }
  if (existing?.icon || icon) {
    next.icon = existing?.icon || icon;
  }
  if (existing?.impact) {
    next.impact = existing.impact;
  }

  return next;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function main() {
  const [traits, occupations, talentTrees] = await Promise.all([
    readJson(traitsPath),
    readJson(occupationsPath),
    readJson(talentTreesPath),
  ]);

  const traitMap = new Map(traits.map((trait) => [trait.id, trait]));
  const originalOrder = traits.map((trait) => trait.id);

  occupations.forEach((occupation) => {
    const traitId = generatedBaselineTraitId(occupation.id);
    const existing = traitMap.get(traitId);
    const generatedTrait = buildGeneratedTrait({
      id: traitId,
      name: `${occupation.name} Baseline`,
      description: occupation.shortDescription || occupation.description || `${occupation.name} baseline bonuses.`,
      effects: occupation.effects || [],
      icon: occupation.icon,
      source: {
        kind: 'occupation-base',
        occupationId: occupation.id,
      },
      existing,
    });

    traitMap.set(traitId, generatedTrait);
    occupation.grantsTraitIds = [traitId];
    delete occupation.effects;
  });

  talentTrees.forEach((tree) => {
    tree.nodes.forEach((node) => {
      const traitId = generatedNodeTraitId(tree.occupationId, node.id);
      const existing = traitMap.get(traitId);
      const generatedTrait = buildGeneratedTrait({
        id: traitId,
        name: node.name,
        description: node.description,
        effects: node.effects || [],
        grantsSkillIds: node.grantsSkillIds || [],
        source: {
          kind: 'occupation-node',
          occupationId: tree.occupationId,
          talentNodeId: node.id,
        },
        existing,
      });

      traitMap.set(traitId, generatedTrait);
      node.grantsTraitIds = [traitId];
      delete node.effects;
      delete node.grantsSkillIds;
    });
  });

  const generatedIds = Array.from(traitMap.keys()).filter((id) => !originalOrder.includes(id));
  const nextTraits = [
    ...originalOrder.map((id) => traitMap.get(id)).filter(Boolean),
    ...generatedIds.map((id) => traitMap.get(id)).filter(Boolean),
  ];

  await Promise.all([
    writeFile(traitsPath, `${JSON.stringify(nextTraits, null, 2)}\n`),
    writeFile(occupationsPath, `${JSON.stringify(occupations, null, 2)}\n`),
    writeFile(talentTreesPath, `${JSON.stringify(talentTrees, null, 2)}\n`),
  ]);

  console.log(`Migrated ${occupations.length} occupations and ${talentTrees.reduce((sum, tree) => sum + tree.nodes.length, 0)} talent nodes into trait grants.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
