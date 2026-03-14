import React, { useState } from 'react';
import { GameRegistry, Character, Skill, resolveCharacterSkills, resolveCharacterTraitGrants, sanitizeSkillLoadout } from '@ashtrail/core';
import type { TacticalEntity, CombatConfig, DamagePreview, CombatResolutionSummary, CombatRosterEntry } from '@ashtrail/core';
import { TacticalArena, type TacticalArenaUtilityAction } from './TacticalArena';
import { useCombatWebSocket } from './useCombatWebSocket';
import { Grid, buildMapPrompt, parseAIGridResponse, generateGrid } from './tacticalGrid';
import { GameRulesManager } from '../rules/useGameRules';
import { useActiveWorld } from '../../hooks/useActiveWorld';
import { useEcologyData } from '../../ecology/useEcologyData';
import { useJobs } from '../../jobs/useJobs';
import { useTrackedJobLauncher } from '../../jobs/useTrackedJobLauncher';
import { DEVTOOLS_ROUTES } from '../../lib/routes';
import type { EcologyBundle, FaunaEntry } from '../../ecology/types';

// ── Default skills given to characters without their own ──
function getDefaultPlayerSkills(): Skill[] {
    return sanitizeSkillLoadout(
        GameRegistry.getAllSkills().filter(s => ['use-weapon', 'first-aid', 'fireball', 'shove', 'healing-pulse', 'piercing-shot', 'sprint', 'defend', 'hide', 'distract', 'analyze'].includes(s.id)),
    );
}
function getDefaultEnemySkills(): Skill[] {
    return sanitizeSkillLoadout(
        GameRegistry.getAllSkills().filter(s => ['use-weapon', 'quick-shot', 'power-strike', 'war-cry'].includes(s.id)),
    );
}

function mapCharToTactical(char: Character, isPlayer: boolean, index: number, defaultPlayerSkills: Skill[], defaultEnemySkills: Skill[]): TacticalEntity {
    const traits = resolveCharacterTraitGrants({
        traits: char.traits,
        occupation: char.occupation,
        progression: char.progression,
    }).traits;
    const rules = GameRulesManager.get();
    const maxHp = rules.core.hpBase + char.stats.endurance * rules.core.hpPerEndurance;
    const maxAp = rules.core.apBase + Math.floor(char.stats.agility / rules.core.apAgilityDivisor);
    const maxMp = rules.core.mpBase;

    // ── 1. Resolve equipped items from registry (fresh data with effects) ──
    const resolvedEquipped: Record<string, any> = {};
    if (char.equipped) {
        for (const [slot, item] of Object.entries(char.equipped)) {
            if (!item) { resolvedEquipped[slot] = null; continue; }
            // Always prefer fresh registry data (has effects, weaponType, etc.)
            const fresh = GameRegistry.getItem((item as any).id);
            resolvedEquipped[slot] = fresh || item;
        }
    }

    const mainHandWeapon = resolvedEquipped.mainHand || null;

    // ── 2. Resolve skills (prefer effect-aware resolution, then hydrate from registry) ──
    const refreshSkill = (skill: Skill) => GameRegistry.getSkill(skill.id) || skill;
    const resolvedSkills = sanitizeSkillLoadout(resolveCharacterSkills(char).map(refreshSkill));

    let skills: Skill[] = resolvedSkills.length > 0
        ? resolvedSkills
        : sanitizeSkillLoadout((char.skills || []).map(refreshSkill));

    if (skills.length === 0) {
        skills = (isPlayer ? defaultPlayerSkills : defaultEnemySkills).map(refreshSkill);
    }

    if (isPlayer) {
        const baseSkills = GameRegistry.getAllSkills().filter((skill) => skill.category === 'base');
        skills = sanitizeSkillLoadout([...skills, ...baseSkills]);
    }

    // ── 3. Patch use-weapon skill with live weapon data (range + description + AOE) ──
    skills = skills.map(skill => {
        if (skill.id !== 'use-weapon') return skill;
        const patched = { ...skill };
        if (mainHandWeapon) {
            patched.maxRange = mainHandWeapon.weaponRange || 1;
            patched.minRange = 1;
            // Propagate weapon AOE to the skill so executeSkill uses getAoECells correctly
            const weapAreaType = (mainHandWeapon as any).weaponAreaType || 'single';
            const weapAreaSize = (mainHandWeapon as any).weaponAreaSize || 0;
            patched.areaType = weapAreaType;
            patched.areaSize = weapAreaSize;
            const typeLabel = (mainHandWeapon.weaponType || 'melee').toUpperCase();
            const dmgMod = mainHandWeapon.effects?.find((e: any) => e.target === 'damage');
            const dmgStr = dmgMod ? ` | Base DMG: ${dmgMod.value}` : '';
            const scalingStr = mainHandWeapon.weaponType === 'ranged' ? ' [FIXED]' : ' + STR';
            const aoeStr = weapAreaType !== 'single' ? ` | AOE: ${weapAreaType}(${weapAreaSize})` : '';
            patched.description = `Attack with ${mainHandWeapon.name} [${typeLabel}${dmgStr}${scalingStr}${aoeStr}]`;
        } else {
            patched.maxRange = 1;
            patched.areaType = 'single';
            patched.areaSize = 0;
            patched.description = 'Attack unarmed [MELEE + STR]';
        }
        return patched;
    });

    return {
        id: `${char.id}_${isPlayer ? 'p' : 'e'}${index}`,
        isPlayer,
        name: char.name,
        strength: char.stats.strength,
        agility: char.stats.agility,
        intelligence: char.stats.intelligence,
        wisdom: char.stats.wisdom,
        endurance: char.stats.endurance,
        charisma: char.stats.charisma,
        evasion: Math.floor(char.stats.agility / 4),
        defense: Math.floor(char.stats.endurance / 2),
        hp: maxHp,
        maxHp,
        ap: maxAp,
        maxAp,
        mp: maxMp,
        maxMp,
        level: char.level,
        critChance: char.stats.intelligence * rules.core.critPerIntelligence,
        resistance: char.stats.wisdom * rules.core.resistPerWisdom,
        socialBonus: char.stats.charisma * rules.core.charismaBonusPerCharisma,
        traits,
        skills,
        occupation: char.occupation,
        progression: char.progression,
        skillCooldowns: {},
        gridPos: { row: 0, col: 0 },
        equipped: resolvedEquipped,
        baseStats: {
            strength: char.stats.strength,
            agility: char.stats.agility,
            intelligence: char.stats.intelligence,
            wisdom: char.stats.wisdom,
            endurance: char.stats.endurance,
            charisma: char.stats.charisma,
            evasion: Math.floor(char.stats.agility / 4),
            defense: Math.floor(char.stats.endurance / 2),
        }
    };
}

function isFaunaSelection(id: string): boolean {
    return id.startsWith('fauna:');
}

function faunaSelectionId(id: string): string {
    return id.replace(/^fauna:/, '');
}

function isKnownCombatantId(
    id: string,
    characterIds: Set<string>,
    faunaIds: Set<string>,
    charactersLoaded: boolean,
): boolean {
    if (!id) return false;
    if (isFaunaSelection(id)) {
        return faunaIds.has(faunaSelectionId(id));
    }
    return charactersLoaded ? characterIds.has(id) : true;
}

function normalizeCombatantSelections(
    ids: string[],
    count: number,
    fallbackId: string,
    characterIds: Set<string>,
    faunaIds: Set<string>,
    charactersLoaded: boolean,
): string[] {
    const normalized = ids.slice(0, count);
    while (normalized.length < count) {
        normalized.push('');
    }

    return normalized.map((id) => {
        if (isKnownCombatantId(id, characterIds, faunaIds, charactersLoaded)) {
            return id;
        }

        if (fallbackId && isKnownCombatantId(fallbackId, characterIds, faunaIds, charactersLoaded)) {
            return fallbackId;
        }

        return id;
    });
}

function mapFaunaToTactical(fauna: FaunaEntry, selectionId: string, isPlayer: boolean, index: number): TacticalEntity {
    const rules = GameRulesManager.get();
    const skills = fauna.skillIds
        .map((skillId) => GameRegistry.getSkill(skillId))
        .filter((skill): skill is Skill => Boolean(skill));
    const maxHp = Math.max(1, rules.core.hpBase + fauna.combatProfile.endurance * rules.core.hpPerEndurance + fauna.combatProfile.baseHpBonus);
    const maxAp = Math.max(1, rules.core.apBase + Math.floor(fauna.combatProfile.agility / rules.core.apAgilityDivisor) + fauna.combatProfile.baseApBonus);
    const maxMp = Math.max(1, rules.core.mpBase + fauna.combatProfile.baseMpBonus);
    const agiScale = 2.5;
    const enduScale = 3.5;
    const derivedDefense =
        Math.floor(
            agiScale * Math.log((Math.max(0, fauna.combatProfile.agility)) + 1)
            + enduScale * Math.log((Math.max(0, fauna.combatProfile.endurance)) + 1),
        ) + fauna.combatProfile.baseDefense;

    return {
        id: `${selectionId}_${isPlayer ? 'p' : 'e'}${index}`,
        isPlayer,
        name: fauna.name,
        strength: fauna.combatProfile.strength,
        agility: fauna.combatProfile.agility,
        intelligence: fauna.combatProfile.intelligence,
        wisdom: fauna.combatProfile.wisdom,
        endurance: fauna.combatProfile.endurance,
        charisma: fauna.combatProfile.charisma,
        evasion: fauna.combatProfile.baseEvasion,
        defense: Math.max(0, derivedDefense),
        hp: maxHp,
        maxHp,
        ap: maxAp,
        maxAp,
        mp: maxMp,
        maxMp,
        level: fauna.combatProfile.level,
        critChance: fauna.combatProfile.critChance,
        resistance: fauna.combatProfile.resistance,
        socialBonus: fauna.combatProfile.socialBonus,
        traits: [],
        skills,
        occupation: null,
        progression: null,
        skillCooldowns: {},
        gridPos: { row: 0, col: 0 },
        equipped: null,
        baseStats: {
            strength: fauna.combatProfile.strength,
            agility: fauna.combatProfile.agility,
            intelligence: fauna.combatProfile.intelligence,
            wisdom: fauna.combatProfile.wisdom,
            endurance: fauna.combatProfile.endurance,
            charisma: fauna.combatProfile.charisma,
            evasion: fauna.combatProfile.baseEvasion,
            defense: fauna.combatProfile.baseDefense,
        },
    };
}

export function CombatSimulator({
    initialPlayerIds,
    initialEnemyIds,
    initialCombatStarted,
    onCombatFinished,
    onCombatCancelled,
    ecologyBundle,
}: {
    initialPlayerIds?: string[],
    initialEnemyIds?: string[],
    initialCombatStarted?: boolean,
    onCombatFinished?: (summary: CombatResolutionSummary) => void,
    onCombatCancelled?: () => void,
    ecologyBundle?: EcologyBundle | null,
} = {}) {
    const { activeWorldId } = useActiveWorld();
    const { waitForJob } = useJobs();
    const launchTrackedJob = useTrackedJobLauncher();
    const ecology = useEcologyData(activeWorldId);
    const [characters, setCharacters] = React.useState<Character[]>(() => GameRegistry.getAllCharacters());
    const [charactersLoaded, setCharactersLoaded] = React.useState(() => GameRegistry.getAllCharacters().length > 0);
    const faunaEntries = ecologyBundle?.fauna ?? ecology.bundle?.fauna ?? [];
    const combatantOptions = React.useMemo(() => ([
        ...characters.map((char) => ({ id: char.id, label: char.name, kind: 'character' as const })),
        ...faunaEntries.map((fauna) => ({ id: `fauna:${fauna.id}`, label: `${fauna.name} [fauna]`, kind: 'fauna' as const })),
    ]), [characters, faunaEntries]);
    const defaultPlayerSelection = combatantOptions[0]?.id || '';
    const defaultEnemySelection = combatantOptions.find((entry) => entry.kind === 'fauna')?.id || combatantOptions[1]?.id || combatantOptions[0]?.id || '';

    // ── Phase: 'setup' or 'combat' ──
    const [combatStarted, setCombatStarted] = useState(initialCombatStarted || false);
    const [combatKey, setCombatKey] = useState(0);

    // ── Combat Config ──
    const [gridRows, setGridRows] = useState(12);
    const [gridCols, setGridCols] = useState(12);

    const [playerIds, setPlayerIds] = useState<string[]>(() => {
        if (initialPlayerIds && initialPlayerIds.length > 0) return initialPlayerIds;
        return [defaultPlayerSelection];
    });
    const [enemyIds, setEnemyIds] = useState<string[]>(() => {
        if (initialEnemyIds && initialEnemyIds.length > 0) return initialEnemyIds;
        return [defaultEnemySelection];
    });

    const [playerCount, setPlayerCount] = useState(playerIds.length);
    const [enemyCount, setEnemyCount] = useState(enemyIds.length);

    // AI Map
    const [mapPrompt, setMapPrompt] = useState('');
    const [aiGrid, setAiGrid] = useState<Grid | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [mapName, setMapName] = useState<string | null>(null);
    const [mapError, setMapError] = useState<string | null>(null);

    // Visual Assets configuration
    const [textureBatches, setTextureBatches] = useState<any[]>([]);
    const [groundMode, setGroundMode] = useState<'battlemap' | 'tiles'>('battlemap');
    const [linkBatches, setLinkBatches] = useState(true);
    const [groundBatchId, setGroundBatchId] = useState<string>("");
    const [obstacleBatchId, setObstacleBatchId] = useState<string>("");

    const [isApplyingTextures, setIsApplyingTextures] = useState(false);
    const [battlemapUrl, setBattlemapUrl] = useState<string | null>(null);

    const characterIds = React.useMemo(() => new Set(characters.map((char) => char.id)), [characters]);
    const faunaIds = React.useMemo(() => new Set(faunaEntries.map((fauna) => fauna.id)), [faunaEntries]);
    const resolvedPlayerIds = React.useMemo(
        () => normalizeCombatantSelections(playerIds, playerCount, defaultPlayerSelection, characterIds, faunaIds, charactersLoaded),
        [characterIds, charactersLoaded, defaultPlayerSelection, faunaIds, playerCount, playerIds],
    );
    const resolvedEnemyIds = React.useMemo(
        () => normalizeCombatantSelections(enemyIds, enemyCount, defaultEnemySelection, characterIds, faunaIds, charactersLoaded),
        [characterIds, charactersLoaded, defaultEnemySelection, enemyCount, enemyIds, faunaIds],
    );
    const canLaunchCombat =
        resolvedPlayerIds.length > 0 &&
        resolvedEnemyIds.length > 0 &&
        resolvedPlayerIds.every((id) => isKnownCombatantId(id, characterIds, faunaIds, charactersLoaded)) &&
        resolvedEnemyIds.every((id) => isKnownCombatantId(id, characterIds, faunaIds, charactersLoaded));

    const updatePlayerCount = (count: number) => {
        setPlayerCount(count);
        setPlayerIds(prev => {
            const next = [...prev];
            const defaultId = defaultPlayerSelection;
            while (next.length < count) next.push(defaultId);
            return next.slice(0, count);
        });
    };
    const updateEnemyCount = (count: number) => {
        setEnemyCount(count);
        setEnemyIds(prev => {
            const next = [...prev];
            const defaultId = defaultEnemySelection;
            while (next.length < count) next.push(defaultId);
            return next.slice(0, count);
        });
    };

    const setPlayerId = (index: number, id: string) => {
        setPlayerIds(prev => { const n = [...prev]; n[index] = id; return n; });
    };
    const setEnemyId = (index: number, id: string) => {
        setEnemyIds(prev => { const n = [...prev]; n[index] = id; return n; });
    };

    React.useEffect(() => {
        // Sync registry with backend
        let isMounted = true;
        GameRegistry.fetchFromBackend("http://127.0.0.1:8787")
            .catch(err => console.warn(err))
            .finally(() => {
                if (!isMounted) return;
                setCharacters(GameRegistry.getAllCharacters());
                setCharactersLoaded(true);
            });

        // Fetch texture batches
        fetch("/api/textures/batches")
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setTextureBatches(data);
            })
            .catch(err => console.error("Failed to fetch texture batches:", err));
        return () => {
            isMounted = false;
        };
    }, []);

    React.useEffect(() => {
        setPlayerIds((prev) => {
            const next = normalizeCombatantSelections(prev, playerCount, defaultPlayerSelection, characterIds, faunaIds, charactersLoaded);
            return next.length === prev.length && next.every((id, index) => id === prev[index]) ? prev : next;
        });
    }, [characterIds, charactersLoaded, defaultPlayerSelection, faunaIds, playerCount]);

    React.useEffect(() => {
        setEnemyIds((prev) => {
            const next = normalizeCombatantSelections(prev, enemyCount, defaultEnemySelection, characterIds, faunaIds, charactersLoaded);
            return next.length === prev.length && next.every((id, index) => id === prev[index]) ? prev : next;
        });
    }, [characterIds, charactersLoaded, defaultEnemySelection, enemyCount, faunaIds]);

    const generateAIMap = async () => {
        if (!mapPrompt.trim() || isGenerating) return;
        setIsGenerating(true);
        setMapError(null);
        setMapName(null);
        try {
            const prompt = buildMapPrompt(mapPrompt.trim(), gridRows, gridCols);
            const accepted = await launchTrackedJob<{ jobId: string }, { prompt: string }>({
                url: '/api/text/generate',
                request: { prompt },
                optimisticJob: {
                    kind: 'combat.text-generate',
                    title: 'Generate Combat Map',
                    tool: 'gameplay-engine',
                    status: 'queued',
                    currentStage: 'Queued',
                    worldId: activeWorldId,
                    metadata: {
                        worldId: activeWorldId,
                        rows: gridRows,
                        cols: gridCols,
                    },
                },
                metadata: {
                    worldId: activeWorldId,
                    rows: gridRows,
                    cols: gridCols,
                },
                restore: {
                    route: DEVTOOLS_ROUTES.gameplayEngine,
                    payload: {
                        tab: 'combat',
                        mapPrompt,
                        gridRows,
                        gridCols,
                    },
                },
            });
            const detail = await waitForJob(accepted.jobId);
            if (detail.status !== 'completed') {
                throw new Error(detail.error || 'Map generation failed');
            }
            const text = String((detail.result as { text?: string } | undefined)?.text || '');
            const grid = parseAIGridResponse(text, gridRows, gridCols);
            if (grid) {
                setAiGrid(grid);
                try {
                    let cleaned = text.trim();
                    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
                    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
                    const parsed = JSON.parse(cleaned);
                    setMapName(parsed.name || null);
                } catch { }
            } else {
                setMapError('Failed to parse AI grid. Try again.');
            }
        } catch (e: any) {
            setMapError(e.message || 'Unknown error');
        } finally {
            setIsGenerating(false);
        }
    };

    const startCombat = async () => {
        if (!canLaunchCombat) return;
        setIsApplyingTextures(true);
        try {
            let baseGrid = aiGrid ? JSON.parse(JSON.stringify(aiGrid)) : generateGrid(gridRows, gridCols, 0.12);
            let resolvedBattlemapUrl: string | null = null;

            const effectiveObstacleBatchId = linkBatches ? groundBatchId : obstacleBatchId;

            // Fetch generic textures
            let groundTextures: any[] = [];
            let obstacleTextures: any[] = [];

            if (groundBatchId) {
                const res = await fetch(`/api/textures/batches/${groundBatchId}`);
                if (res.ok) {
                    const manifest = await res.json();
                    groundTextures = Array.isArray(manifest.textures)
                        ? manifest.textures.map((t: any) => ({ ...t, batchSubCategory: manifest.subCategory }))
                        : [];
                }
            }

            if (effectiveObstacleBatchId && effectiveObstacleBatchId !== groundBatchId) {
                const res = await fetch(`/api/textures/batches/${effectiveObstacleBatchId}`);
                if (res.ok) {
                    const manifest = await res.json();
                    obstacleTextures = Array.isArray(manifest.textures)
                        ? manifest.textures.map((t: any) => ({ ...t, batchSubCategory: manifest.subCategory }))
                        : [];
                }
            } else {
                obstacleTextures = groundTextures;
            }

            // --- Process Ground ---
            let gPool: any[] = [];
            if (groundTextures.length > 0) {
                if (groundMode === 'battlemap') {
                    const battlemapT = groundTextures.filter((t: any) =>
                        t.batchSubCategory === 'battlemap' ||
                        t.prompt.toLowerCase().includes('battlemap') ||
                        t.prompt.toLowerCase().includes('terrain') ||
                        t.prompt.toLowerCase().includes('background')
                    );
                    // Use matched battlemaps, or fall back to ANY texture in the batch
                    const bmPool = battlemapT.length > 0 ? battlemapT : groundTextures;
                    resolvedBattlemapUrl = bmPool[Math.floor(Math.random() * bmPool.length)].url;
                } else {
                    gPool = groundTextures.filter((t: any) =>
                        t.batchSubCategory === 'ground' ||
                        t.prompt.toLowerCase().includes('ground') ||
                        t.prompt.toLowerCase().includes('floor') ||
                        t.prompt.toLowerCase().includes('dirt') ||
                        t.prompt.toLowerCase().includes('grass')
                    );
                    if (gPool.length === 0) gPool = groundTextures; // fallback
                }
            }

            // --- Process Obstacles ---
            let oPool: any[] = [];
            if (obstacleTextures.length > 0) {
                oPool = obstacleTextures.filter((t: any) =>
                    t.batchSubCategory !== 'battlemap' &&
                    t.batchSubCategory !== 'ground' &&
                    !t.prompt.toLowerCase().includes('battlemap') &&
                    (t.prompt.toLowerCase().includes('obstacle') ||
                        t.prompt.toLowerCase().includes('wall') ||
                        t.prompt.toLowerCase().includes('object') ||
                        t.prompt.toLowerCase().includes('rock') ||
                        t.prompt.toLowerCase().includes('tree'))
                );
                if (oPool.length === 0) {
                    // fallback: basically anything that isn't a battlemap or pure ground/terrain
                    oPool = obstacleTextures.filter((t: any) => {
                        if (t.batchSubCategory === 'battlemap' || t.batchSubCategory === 'ground') return false;
                        const pr = t.prompt.toLowerCase();
                        return !pr.includes('battlemap') &&
                            !pr.includes('ground') &&
                            !pr.includes('terrain') &&
                            !pr.includes('background') &&
                            !pr.includes('floor') &&
                            !pr.includes('dirt') &&
                            !pr.includes('grass');
                    });
                }
            }

            // --- Apply to Grid ---
            baseGrid.forEach((row: any[]) => {
                row.forEach(cell => {
                    if (cell.walkable) {
                        if (groundMode === 'battlemap' || gPool.length === 0) {
                            cell.textureUrl = undefined;
                        } else {
                            cell.textureUrl = gPool[Math.floor(Math.random() * gPool.length)].url;
                        }
                    } else if (oPool.length > 0) {
                        cell.textureUrl = oPool[Math.floor(Math.random() * oPool.length)].url;
                    }
                });
            });

            setBattlemapUrl(resolvedBattlemapUrl);
            setAiGrid(baseGrid);
            setCombatKey(k => k + 1);
            setCombatStarted(true);
        } catch (e) {
            console.error("Failed to start combat with textures:", e);
            // Fallback to basic start
            setBattlemapUrl(null);
            setCombatKey(k => k + 1);
            setCombatStarted(true);
        } finally {
            setIsApplyingTextures(false);
        }
    };

    const returnToSetup = () => {
        setCombatStarted(false);
        setAiGrid(null);
        setMapName(null);
        setMapError(null);
        onCombatCancelled?.();
    };

    const config: CombatConfig = { gridRows, gridCols };

    // ═══════════════════════════════════════════════════
    // PRE-COMBAT SETUP SCREEN
    // ═══════════════════════════════════════════════════
    if (!combatStarted) {
        return (
            <div className="w-full h-full flex items-center justify-center p-8">
                <div className="w-full max-w-[900px] bg-[#111318] border border-white/5 rounded-2xl shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="px-8 py-5 border-b border-white/5 bg-black/40">
                        <h2 className="text-lg font-black uppercase tracking-[0.3em] text-orange-500">⚔️ Combat Setup</h2>
                        <p className="text-gray-500 text-xs mt-1">Configure the battlefield and combatants before engaging.</p>
                    </div>

                    <div className="p-8 space-y-8">
                        {/* ── Grid Size ── */}
                        <section>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Battlefield Dimensions</h3>
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[9px] text-gray-500 uppercase">Rows</label>
                                    <input type="number" min={6} max={20} value={gridRows}
                                        onChange={e => setGridRows(Math.max(6, Math.min(20, +e.target.value)))}
                                        className="w-20 bg-black/60 border border-white/10 text-white text-sm px-3 py-2 rounded-lg text-center outline-none focus:border-orange-500/50" />
                                </div>
                                <span className="text-gray-600 font-black text-lg mt-4">×</span>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[9px] text-gray-500 uppercase">Columns</label>
                                    <input type="number" min={6} max={20} value={gridCols}
                                        onChange={e => setGridCols(Math.max(6, Math.min(20, +e.target.value)))}
                                        className="w-20 bg-black/60 border border-white/10 text-white text-sm px-3 py-2 rounded-lg text-center outline-none focus:border-orange-500/50" />
                                </div>
                                <div className="ml-4 text-[10px] text-gray-600 bg-black/30 rounded-lg px-3 py-2">
                                    {gridRows * gridCols} cells • ~{Math.round(gridRows * gridCols * 0.12)} obstacles
                                </div>
                            </div>
                        </section>

                        {/* ── Combatants ── */}
                        <div className="grid grid-cols-2 gap-6">
                            {/* Players */}
                            <section>
                                <div className="flex items-center gap-3 mb-3">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-400">Players</h3>
                                    <div className="flex items-center gap-1.5">
                                        <button onClick={() => updatePlayerCount(Math.max(1, playerCount - 1))}
                                            className="w-6 h-6 rounded bg-black/50 border border-white/10 text-gray-400 text-xs hover:bg-white/10">−</button>
                                        <span className="text-white font-bold text-sm w-4 text-center">{playerCount}</span>
                                        <button onClick={() => updatePlayerCount(Math.min(4, playerCount + 1))}
                                            className="w-6 h-6 rounded bg-black/50 border border-white/10 text-gray-400 text-xs hover:bg-white/10">+</button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {Array.from({ length: playerCount }).map((_, i) => (
                                        <div key={`p-${i}`} className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-blue-600 border border-blue-400 flex items-center justify-center text-[9px] font-black text-white shrink-0">
                                                P{i + 1}
                                            </div>
                                            <select value={resolvedPlayerIds[i] || defaultPlayerSelection}
                                                onChange={e => setPlayerId(i, e.target.value)}
                                                className="flex-1 bg-black/50 border border-blue-500/20 text-white text-xs px-3 py-2 rounded-lg outline-none focus:border-blue-500/50">
                                                {combatantOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Enemies */}
                            <section>
                                <div className="flex items-center gap-3 mb-3">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-red-400">Enemies</h3>
                                    <div className="flex items-center gap-1.5">
                                        <button onClick={() => updateEnemyCount(Math.max(1, enemyCount - 1))}
                                            className="w-6 h-6 rounded bg-black/50 border border-white/10 text-gray-400 text-xs hover:bg-white/10">−</button>
                                        <span className="text-white font-bold text-sm w-4 text-center">{enemyCount}</span>
                                        <button onClick={() => updateEnemyCount(Math.min(4, enemyCount + 1))}
                                            className="w-6 h-6 rounded bg-black/50 border border-white/10 text-gray-400 text-xs hover:bg-white/10">+</button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {Array.from({ length: enemyCount }).map((_, i) => (
                                        <div key={`e-${i}`} className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-red-600 border border-red-400 flex items-center justify-center text-[9px] font-black text-white shrink-0">
                                                E{i + 1}
                                            </div>
                                            <select value={resolvedEnemyIds[i] || defaultEnemySelection}
                                                onChange={e => setEnemyId(i, e.target.value)}
                                                className="flex-1 bg-black/50 border border-red-500/20 text-white text-xs px-3 py-2 rounded-lg outline-none focus:border-red-500/50">
                                                {combatantOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>

                        {/* ── Visual Assets ── */}
                        <section>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Visual Assets</h3>
                                <label className="flex items-center gap-2 cursor-pointer group" onClick={() => setLinkBatches(!linkBatches)}>
                                    <div className={`w-8 h-4 rounded-full transition-colors flex items-center p-0.5 ${linkBatches ? 'bg-emerald-500' : 'bg-gray-700'}`}>
                                        <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${linkBatches ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </div>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest group-hover:text-gray-200 transition-colors select-none">
                                        Bundle Packs
                                    </span>
                                </label>
                            </div>

                            <div className="flex gap-4">
                                {/* Ground Configuration */}
                                <div className="flex-1 bg-black/30 p-4 rounded-xl border border-white/5 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[9px] font-bold text-gray-500 uppercase">Ground Rendering</label>
                                        <div className="flex bg-black/50 rounded-lg p-1 border border-white/5">
                                            <button
                                                onClick={() => setGroundMode('battlemap')}
                                                className={`px-3 py-1 text-[9px] font-bold tracking-widest uppercase rounded ${groundMode === 'battlemap' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}
                                            >
                                                Battlemap
                                            </button>
                                            <button
                                                onClick={() => setGroundMode('tiles')}
                                                className={`px-3 py-1 text-[9px] font-bold tracking-widest uppercase rounded ${groundMode === 'tiles' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}
                                            >
                                                Tiles
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-gray-500 uppercase mb-1 block">Ground Pack</label>
                                        <select
                                            value={groundBatchId}
                                            onChange={e => setGroundBatchId(e.target.value)}
                                            className="w-full bg-black/60 border border-emerald-500/20 text-white text-xs px-3 py-2.5 rounded-lg outline-none focus:border-emerald-500/50"
                                        >
                                            <option value="">No Ground Asset (Default)</option>
                                            {textureBatches.map(batch => (
                                                <option key={batch.batchId} value={batch.batchId}>
                                                    {batch.subCategory ? `[${batch.subCategory.toUpperCase()}] ` : ''}{batch.batchName || batch.batchId} ({batch.createdAt.split('T')[0]})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Obstacle Configuration */}
                                <div className={`flex-1 p-4 rounded-xl border border-white/5 space-y-4 transition-all ${linkBatches ? 'bg-black/10 opacity-50 pointer-events-none' : 'bg-black/30'}`}>
                                    <label className="text-[9px] font-bold text-gray-500 uppercase block">Obstacle Rendering</label>
                                    <div>
                                        <label className="text-[9px] text-gray-500 uppercase mb-1 block">Obstacle Pack</label>
                                        <select
                                            value={linkBatches ? groundBatchId : obstacleBatchId}
                                            onChange={e => setObstacleBatchId(e.target.value)}
                                            className="w-full bg-black/60 border border-emerald-500/20 text-white text-xs px-3 py-2.5 rounded-lg outline-none focus:border-emerald-500/50"
                                            disabled={linkBatches}
                                        >
                                            <option value="">{linkBatches ? '(Linked to Ground Pack)' : 'No Obstacle Asset (Default)'}</option>
                                            {!linkBatches && textureBatches.map(batch => (
                                                <option key={batch.batchId} value={batch.batchId}>
                                                    {batch.subCategory ? `[${batch.subCategory.toUpperCase()}] ` : ''}{batch.batchName || batch.batchId} ({batch.createdAt.split('T')[0]})
                                                </option>
                                            ))}
                                        </select>
                                        <div className="mt-3 text-[9px] text-gray-500 leading-relaxed">
                                            {linkBatches
                                                ? "Obstacles will be extraced from the same pack as the Ground."
                                                : "Obstacles will be rendered using 'obstacle', 'tree', or 'wall' prompts from this separate pack."}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* ── AI Map Generation ── */}
                        <section>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-3">AI Map Generation <span className="text-gray-600 font-normal">(optional)</span></h3>
                            <div className="flex gap-2">
                                <input value={mapPrompt} onChange={e => setMapPrompt(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') generateAIMap(); }}
                                    placeholder="Describe a battlefield... (e.g. 'ruined temple with pillars and a central altar')"
                                    className="flex-1 bg-black/50 border border-white/10 text-white text-xs px-3 py-2.5 rounded-lg outline-none focus:border-indigo-500/50 placeholder:text-gray-600"
                                    disabled={isGenerating} />
                                <button onClick={generateAIMap}
                                    disabled={isGenerating || !mapPrompt.trim()}
                                    className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-30 text-white font-black uppercase tracking-widest rounded-lg text-[10px] transition-all shrink-0">
                                    {isGenerating ? '⟳ Generating...' : '✨ Generate'}
                                </button>
                            </div>
                            {mapName && (
                                <div className="mt-2 text-xs text-indigo-400 font-mono bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20 inline-block">
                                    ✓ Map generated: {mapName}
                                </div>
                            )}
                            {mapError && (
                                <div className="mt-2 text-xs text-red-400">⚠ {mapError}</div>
                            )}
                        </section>

                        {/* ── Launch Button ── */}
                        <div className="flex justify-between items-center pt-4 border-t border-white/5">
                            <div className="text-[10px] text-gray-600">
                                {playerCount} player{playerCount > 1 ? 's' : ''} vs {enemyCount} enem{enemyCount > 1 ? 'ies' : 'y'} on a {gridRows}×{gridCols} grid
                                {mapName ? ` • ${mapName}` : ' • Random map'}
                            </div>
                            <button onClick={startCombat}
                                disabled={isApplyingTextures || !canLaunchCombat}
                                className="px-8 py-3 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-950 disabled:text-orange-900 text-black font-black uppercase tracking-[0.2em] rounded-xl text-sm transition-all shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40">
                                {isApplyingTextures ? 'Initializing...' : '⚔️ Start Combat'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════
    // ACTIVE COMBAT
    // ═══════════════════════════════════════════════════
    return (
        <div className="w-full h-full flex flex-col gap-0 bg-black/40 border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            {/* Thin top bar with back button */}
            <div className="shrink-0 flex items-center justify-between px-4 py-1.5 bg-black/60 border-b border-white/5">
                <button onClick={returnToSetup}
                    className="text-[9px] text-gray-500 hover:text-white font-bold uppercase tracking-widest transition-all">
                    ← Back to Setup
                </button>
                <span className="text-[9px] text-gray-600">
                    {playerCount}v{enemyCount} • {gridRows}×{gridCols}{mapName ? ` • ${mapName}` : ''}
                </span>
            </div>

            {/* Arena */}
            <div className="flex-1 overflow-hidden">
                <CombatEncounterView
                    key={`combat-${combatKey}`}
                    playerIds={resolvedPlayerIds}
                    enemyIds={resolvedEnemyIds}
                    faunaEntries={faunaEntries}
                    aiGrid={aiGrid}
                    config={config}
                    battlemapUrl={battlemapUrl}
                    variant="gameplay"
                    onCombatFinished={onCombatFinished}
                />
            </div>
        </div>
    );
}

export interface CombatEncounterViewProps {
    playerIds: string[];
    enemyIds: string[];
    aiGrid?: Grid | null;
    config: CombatConfig;
    battlemapUrl?: string | null;
    onCombatFinished?: (summary: CombatResolutionSummary) => void;
    faunaEntries: FaunaEntry[];
    variant?: 'gameplay' | 'quest';
    utilityActions?: TacticalArenaUtilityAction[];
}

export function CombatEncounterView({
    playerIds,
    enemyIds,
    aiGrid = null,
    config,
    battlemapUrl = null,
    onCombatFinished,
    faunaEntries,
    variant = 'gameplay',
    utilityActions = [],
}: CombatEncounterViewProps) {
    const defaultPlayerSkills = getDefaultPlayerSkills();
    const defaultEnemySkills = getDefaultEnemySkills();
    const faunaById = React.useMemo(() => new Map(faunaEntries.map((entry) => [entry.id, entry])), [faunaEntries]);
    const usesRoster = React.useMemo(
        () => [...playerIds, ...enemyIds].every((id) => !isFaunaSelection(id)),
        [enemyIds, playerIds],
    );

    const playerRoster = React.useMemo<CombatRosterEntry[]>(
        () => playerIds.map((characterId, index) => ({
            rosterId: `player-${index}`,
            characterId,
            team: 'player',
        })),
        [playerIds],
    );

    const enemyRoster = React.useMemo<CombatRosterEntry[]>(
        () => enemyIds.map((characterId, index) => ({
            rosterId: `enemy-${index}`,
            characterId,
            team: 'enemy',
        })),
        [enemyIds],
    );

    // Build TacticalEntity for each character using the resolved data from mapCharToTactical
    const playerEntities = playerIds
        .map((id, i) => {
            if (isFaunaSelection(id)) {
                const fauna = faunaById.get(faunaSelectionId(id));
                return fauna ? mapFaunaToTactical(fauna, id, true, i) : null;
            }
            const char = GameRegistry.getCharacter(id);
            return char ? mapCharToTactical(char, true, i, defaultPlayerSkills, defaultEnemySkills) : null;
        })
        .filter((entity): entity is TacticalEntity => entity !== null);

    const enemyEntities = enemyIds
        .map((id, i) => {
            if (isFaunaSelection(id)) {
                const fauna = faunaById.get(faunaSelectionId(id));
                return fauna ? mapFaunaToTactical(fauna, id, false, i) : null;
            }
            const char = GameRegistry.getCharacter(id);
            return char ? mapCharToTactical(char, false, i, defaultPlayerSkills, defaultEnemySkills) : null;
        })
        .filter((entity): entity is TacticalEntity => entity !== null);

    const combatSetup = React.useMemo(() => {
        if (usesRoster) {
            return {
                roster: [...playerRoster, ...enemyRoster],
                grid: aiGrid || undefined,
                config,
            };
        }

        return {
            players: playerEntities,
            enemies: enemyEntities,
            grid: aiGrid || undefined,
            config,
        };
    }, [aiGrid, config, enemyEntities, enemyRoster, playerEntities, playerRoster, usesRoster]);

    // ── Use LOCAL combat engine (correct weapon damage, game rules, modifiers) ──
    const {
        grid, entities, turnOrder, activeEntityId, activeEntity,
        isPlayerTurn, phase, playerAction, logs, turnNumber,
        handleCellClick, endTurn, selectSkill, selectedSkill, previewState,
        previewMove, previewBasicAttack, previewSkill, MELEE_ATTACK_COST,
    } = useCombatWebSocket(combatSetup);

    const hasReportedCombatEnd = React.useRef(false);
    const resolveEntityByBaseId = React.useCallback((baseId: string, isPlayer: boolean) => {
        return Array.from(entities.values()).find((entity) => {
            if (entity.isPlayer !== isPlayer) return false;
            return entity.id === baseId || entity.id.startsWith(`${baseId}_${isPlayer ? 'p' : 'e'}`);
        });
    }, [entities]);

    React.useEffect(() => {
        if ((phase !== 'victory' && phase !== 'defeat') || hasReportedCombatEnd.current) return;
        hasReportedCombatEnd.current = true;
        onCombatFinished?.({
            outcome: phase,
            survivingPlayerIds: usesRoster
                ? playerRoster
                    .filter((entry) => (entities.get(entry.rosterId)?.hp ?? 0) > 0)
                    .map((entry) => entry.characterId)
                : playerIds.filter((id) => (resolveEntityByBaseId(id, true)?.hp ?? 0) > 0),
            defeatedEnemyIds: usesRoster
                ? enemyRoster
                    .filter((entry) => (entities.get(entry.rosterId)?.hp ?? 0) <= 0)
                    .map((entry) => entry.characterId)
                : enemyIds.filter((id) => (resolveEntityByBaseId(id, false)?.hp ?? 0) <= 0),
            playerSnapshots: Array.from(entities.values())
                .filter((entity) => entity.isPlayer)
                .map((entity) => ({ id: entity.id, hp: entity.hp, maxHp: entity.maxHp })),
            enemySnapshots: Array.from(entities.values())
                .filter((entity) => !entity.isPlayer)
                .map((entity) => ({ id: entity.id, hp: entity.hp, maxHp: entity.maxHp })),
            turnCount: turnNumber,
        });
    }, [enemyIds, enemyRoster, entities, onCombatFinished, phase, playerIds, playerRoster, resolveEntityByBaseId, turnNumber, usesRoster]);

    const getDamagePreview = React.useCallback((attacker: TacticalEntity, target: TacticalEntity, skill: Skill): DamagePreview | null => {
        if (!skill.damage && !skill.pushDistance) return null;

        const rules = GameRulesManager.get();
        const isMagical = skill.effectType === 'magical';
        const isPhysical = skill.effectType === 'physical';

        let baseDmg = skill.damage || 0;
        const weaponReplacement = skill.effects?.find(e => e.type === 'WEAPON_DAMAGE_REPLACEMENT' as any);
        if (weaponReplacement && attacker.equipped?.mainHand) {
            const weapon = attacker.equipped.mainHand;
            const weaponDmgEffect = weapon.effects?.find(e =>
                e.target === 'damage' || e.target === 'physical_damage' || e.type === 'COMBAT_BONUS' as any
            );
            if (weaponDmgEffect) {
                if (weaponDmgEffect.isPercentage) baseDmg = Math.floor(baseDmg * (1 + (weaponDmgEffect.value / 100)));
                else baseDmg = weaponDmgEffect.value;
            }
        }

        const vMin = rules.combat.damageVarianceMin || 0.85;
        const vMax = rules.combat.damageVarianceMax || 1.15;
        const strengthToPowerRatio = rules.combat.strengthToPowerRatio || 1;
        const weaponType = attacker.equipped?.mainHand?.weaponType;
        const isRangedWeapon = weaponType === 'ranged';

        const analyzedBonus = target.activeEffects?.filter(e => e.type === 'ANALYZED' as any).reduce((sum: number, e: any) => sum + (e.value || 0), 0) || 0;
        const finalCritChance = attacker.critChance + (analyzedBonus / 100);

        const calcRaw = (variance: number) => {
            if (skill.pushDistance) {
                const shoveBonus = attacker.strength * (rules.combat.shovePushDamageRatio || 0.1);
                return Math.floor((baseDmg + shoveBonus) * variance);
            }

            if (weaponReplacement) {
                if (isRangedWeapon) {
                    return Math.floor(baseDmg * variance);
                }
                const minScale = rules.combat.strengthScalingMin || 0.2;
                const maxScale = rules.combat.strengthScalingMax || 0.4;
                const scale = variance === vMin ? minScale : maxScale;
                const statBonus = (baseDmg * scale * attacker.strength) / 10;
                return Math.floor((baseDmg + statBonus) * variance);
            }

            return Math.floor((baseDmg + (attacker.strength * strengthToPowerRatio)) * variance);
        };

        const calc = (variance: number, crit: boolean) => {
            let d = calcRaw(variance);
            if (crit) d = Math.floor(d * 1.5);
            if (isMagical) {
                const resist = Math.floor(d * (target.resistance || 0));
                return Math.max(1, d - resist);
            }
            if (isPhysical || weaponReplacement || skill.pushDistance) {
                return Math.max(1, d - (target.defense || 0));
            }
            return Math.max(1, d);
        };

        return {
            min: calc(vMin, false),
            max: calc(vMax, false),
            critMin: calc(vMin, true),
            critMax: calc(vMax, true),
            isMagical,
            critChance: isNaN(finalCritChance) ? (attacker.critChance || 0) : finalCritChance,
        };
    }, []);

    return (
        <TacticalArena
            grid={grid}
            entities={entities}
            turnOrder={turnOrder}
            activeEntityId={activeEntityId}
            activeEntity={activeEntity}
            isPlayerTurn={isPlayerTurn}
            phase={phase}
            playerAction={playerAction}
            logs={logs}
            turnNumber={turnNumber}
            onCellClick={handleCellClick}
            onEndTurn={endTurn}
            onSelectSkill={selectSkill}
            meleeAttackCost={MELEE_ATTACK_COST}
            selectedSkill={selectedSkill}
            battlemapUrl={battlemapUrl}
            getDamagePreview={getDamagePreview}
            variant={variant}
            utilityActions={utilityActions}
            previewState={previewState}
            onPreviewMove={previewMove}
            onPreviewBasicAttack={previewBasicAttack}
            onPreviewSkill={previewSkill}
        />
    );
}
