import traitsData from './data/traits.json';
import occupationsData from './data/occupations.json';
import itemsData from './data/items.json';
import skillsData from './data/skills.json';
import talentTreesData from './data/talentTrees.json';
import { Item, Occupation, Skill, TalentTree, Trait } from './types';

export const ALL_TRAITS: Trait[] = traitsData as Trait[];
export const ALL_OCCUPATIONS: Occupation[] = occupationsData as Occupation[];
export const ALL_ITEMS: Item[] = itemsData as Item[];
export const ALL_SKILLS: Skill[] = skillsData as Skill[];
export const ALL_TALENT_TREES: TalentTree[] = talentTreesData as TalentTree[];

export const TALENT_TREE_LOOKUP: Record<string, TalentTree> = Object.fromEntries(
  ALL_TALENT_TREES.map((tree) => [tree.occupationId, tree]),
);
