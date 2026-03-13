import { ALL_SKILLS } from '../../content';
import { Occupation, Skill, TalentTree, Trait } from '../../types';
import { isSupportedEffectTarget } from './catalog';

export interface GameplayContentIssue {
  level: 'error' | 'warning';
  category: 'traits' | 'occupations' | 'talentTrees';
  id: string;
  message: string;
}

export interface GameplayContentValidationReport {
  issues: GameplayContentIssue[];
  summary: {
    errorCount: number;
    warningCount: number;
    traitCount: number;
    occupationCount: number;
    treeCount: number;
  };
}

function validateEffects(
  category: GameplayContentIssue['category'],
  id: string,
  effects: { target?: string; type: string }[] | undefined,
  issues: GameplayContentIssue[],
) {
  effects?.forEach((effect) => {
    if (!isSupportedEffectTarget(effect.target)) {
      issues.push({
        level: 'error',
        category,
        id,
        message: `Unsupported effect target "${effect.target}"`,
      });
    }
    if (effect.type === 'LORE_EFFECT') {
      issues.push({
        level: 'warning',
        category,
        id,
        message: 'Contains a LORE_EFFECT entry. Ensure it is not the only gameplay payload.',
      });
    }
  });
}

function detectDuplicates(ids: string[], category: GameplayContentIssue['category'], issues: GameplayContentIssue[]) {
  const seen = new Set<string>();
  ids.forEach((id) => {
    if (seen.has(id)) {
      issues.push({ level: 'error', category, id, message: 'Duplicate id detected.' });
    }
    seen.add(id);
  });
}

export function validateGameplayContent(
  traits: Trait[],
  occupations: Occupation[],
  talentTrees: TalentTree[],
  skills: Skill[] = ALL_SKILLS,
): GameplayContentValidationReport {
  const issues: GameplayContentIssue[] = [];
  const traitIds = new Set(traits.map((trait) => trait.id));
  const skillIds = new Set(skills.map((skill) => skill.id));

  detectDuplicates(traits.map((trait) => trait.id), 'traits', issues);
  detectDuplicates(occupations.map((occupation) => occupation.id), 'occupations', issues);
  detectDuplicates(talentTrees.map((tree) => tree.occupationId), 'talentTrees', issues);

  traits.forEach((trait) => {
    const hasMechanicalEffect = (trait.effects || []).some((effect) => effect.type !== 'LORE_EFFECT');
    const hasGrantedSkills = Boolean(trait.grantsSkillIds?.length);
    if (!hasMechanicalEffect && !hasGrantedSkills) {
      issues.push({
        level: 'error',
        category: 'traits',
        id: trait.id,
        message: 'Trait has neither a gameplay modifier nor a granted skill.',
      });
    }
    trait.grantsSkillIds?.forEach((skillId) => {
      if (!skillIds.has(skillId)) {
        issues.push({
          level: 'error',
          category: 'traits',
          id: trait.id,
          message: `Trait grants missing skill "${skillId}".`,
        });
      }
    });
    validateEffects('traits', trait.id, trait.effects, issues);
  });

  occupations.forEach((occupation) => {
    const hasTraitLinks = Boolean(occupation.grantsTraitIds?.length);
    const hasLegacyEffects = Boolean((occupation.effects || []).some((effect) => effect.type !== 'LORE_EFFECT'));
    if (!hasTraitLinks && !hasLegacyEffects) {
      issues.push({
        level: 'error',
        category: 'occupations',
        id: occupation.id,
        message: 'Occupation has no gameplay payload.',
      });
    }
    if (!hasTraitLinks) {
      issues.push({
        level: 'warning',
        category: 'occupations',
        id: occupation.id,
        message: 'Occupation does not grant canonical trait ids yet.',
      });
    }
    if (hasLegacyEffects) {
      issues.push({
        level: 'warning',
        category: 'occupations',
        id: occupation.id,
        message: 'Occupation still uses raw effects. Migrate them to granted traits.',
      });
    }
    occupation.grantsTraitIds?.forEach((traitId) => {
      if (!traitIds.has(traitId)) {
        issues.push({
          level: 'error',
          category: 'occupations',
          id: occupation.id,
          message: `Occupation grants missing trait "${traitId}".`,
        });
      }
    });
    validateEffects('occupations', occupation.id, occupation.effects, issues);
  });

  talentTrees.forEach((tree) => {
    const nodeIds = new Set(tree.nodes.map((node) => node.id));
    tree.nodes.forEach((node) => {
      const hasLegacyEffects = Boolean(node.effects?.length);
      const hasLegacySkills = Boolean(node.grantsSkillIds?.length);
      const hasTraitLinks = Boolean(node.grantsTraitIds?.length);
      const hasPayload = Boolean(hasLegacyEffects || hasLegacySkills || hasTraitLinks);
      if (!hasPayload) {
        issues.push({
          level: 'error',
          category: 'talentTrees',
          id: `${tree.occupationId}:${node.id}`,
          message: 'Talent node has no gameplay payload.',
        });
      }
      if (!hasTraitLinks) {
        issues.push({
          level: 'warning',
          category: 'talentTrees',
          id: `${tree.occupationId}:${node.id}`,
          message: 'Talent node does not grant canonical trait ids yet.',
        });
      }
      if (hasLegacyEffects) {
        issues.push({
          level: 'warning',
          category: 'talentTrees',
          id: `${tree.occupationId}:${node.id}`,
          message: 'Talent node still uses raw effects. Migrate them to granted traits.',
        });
      }
      if (hasLegacySkills) {
        issues.push({
          level: 'warning',
          category: 'talentTrees',
          id: `${tree.occupationId}:${node.id}`,
          message: 'Talent node still grants raw skills. Move them onto the linked trait.',
        });
      }
      node.grantsTraitIds?.forEach((traitId) => {
        if (!traitIds.has(traitId)) {
          issues.push({
            level: 'error',
            category: 'talentTrees',
            id: `${tree.occupationId}:${node.id}`,
            message: `Talent node grants missing trait "${traitId}".`,
          });
        }
      });
      node.grantsSkillIds?.forEach((skillId) => {
        if (!skillIds.has(skillId)) {
          issues.push({
            level: 'error',
            category: 'talentTrees',
            id: `${tree.occupationId}:${node.id}`,
            message: `Talent node grants missing skill "${skillId}".`,
          });
        }
      });

      node.dependencies?.forEach((dependency) => {
        if (!nodeIds.has(dependency)) {
          issues.push({
            level: 'error',
            category: 'talentTrees',
            id: `${tree.occupationId}:${node.id}`,
            message: `Talent node depends on missing node "${dependency}".`,
          });
        }
      });

      validateEffects('talentTrees', `${tree.occupationId}:${node.id}`, node.effects, issues);
    });

    const nodesWithChildren = new Set<string>();
    tree.nodes.forEach((node) => node.dependencies?.forEach((dependency) => nodesWithChildren.add(dependency)));
    tree.nodes.forEach((node) => {
      const isLeaf = !nodesWithChildren.has(node.id);
      const isCapstone = node.pos.y >= 280 || /-(8|9)$/.test(node.id);
      if (isLeaf && !isCapstone) {
        issues.push({
          level: 'warning',
          category: 'talentTrees',
          id: `${tree.occupationId}:${node.id}`,
          message: 'Talent node is a dead-end before the intended capstone tier.',
        });
      }
    });
  });

  return {
    issues,
    summary: {
      errorCount: issues.filter((issue) => issue.level === 'error').length,
      warningCount: issues.filter((issue) => issue.level === 'warning').length,
      traitCount: traits.length,
      occupationCount: occupations.length,
      treeCount: talentTrees.length,
    },
  };
}
