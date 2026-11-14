import { atom } from "jotai";
import { buildDataSelector } from "./build-data";
import { configSelector } from "./config";
import { requiredGemsSelector } from "./gem";
import { routeFilesSelector } from "./route-files";
import type { RouteData } from "common";
import { persistentAtom, transientAtomFamily } from ".";
import { RESET } from "jotai/utils";
import { atomEffect, observe } from "jotai-effect";
import { resolveAreaProgress, routeDeviation } from "../utility/area-progress";
import { scrollToRouteEntry } from "../utility/route-scroll";

const baseRouteSelector = atom(async (get) => {
  const { initializeRouteState, parseRoute } = await import("common");

  const routeFiles = await get(routeFilesSelector);
  const buildData = await get(buildDataSelector);

  const routeState = initializeRouteState();

  if (buildData == null || buildData.leagueStart)
    routeState.preprocessorDefinitions.add("LEAGUE_START");

  if (buildData == null || buildData.library)
    routeState.preprocessorDefinitions.add("LIBRARY");

  const bandit = buildData?.bandit || "None";
  switch (bandit) {
    case "None":
      routeState.preprocessorDefinitions.add("BANDIT_KILL");
      break;
    case "Oak":
      routeState.preprocessorDefinitions.add("BANDIT_OAK");
      break;
    case "Kraityn":
      routeState.preprocessorDefinitions.add("BANDIT_KRAITYN");
      break;
    case "Alira":
      routeState.preprocessorDefinitions.add("BANDIT_ALIRA");
      break;
  }

  return parseRoute(routeFiles, routeState);
});

export const routeSelector = atom(async (get) => {
  const { buildGemSteps, findCharacterGems, Data } = await import("common");

  const baseRoute = await get(baseRouteSelector);
  const buildData = get(buildDataSelector);
  const settings = get(configSelector);
  const requiredGems = get(requiredGemsSelector);

  if (requiredGems.length == 0) return baseRoute;

  const route: RouteData.Route = { sections: [], edges: baseRoute.edges };
  const questGems: Set<number> = new Set();
  const vendorGems: Set<number> = new Set();

  findCharacterGems(buildData, requiredGems, questGems);

  for (const baseSection of baseRoute.sections) {
    const section: RouteData.Section = {
      name: baseSection.name,
      steps: [],
    };

    for (const baseStep of baseSection.steps) {
      const gemSteps: RouteData.GemStep[] = [];
      if (baseStep.type != "fragment_step") continue;

      for (const part of baseStep.parts) {
        if (typeof part !== "string" && part.type === "quest") {
          gemSteps.push(
            ...buildGemSteps(
              part,
              buildData,
              requiredGems,
              questGems,
              vendorGems,
            ),
          );
        }
      }

      const skipStep = settings.gemsOnly && gemSteps.length === 0;
      if (!skipStep) {
        const searchString = gemSteps
          .map((x) => Data.Gems[x.requiredGem.id].name)
          .join("|");

        let step;
        if (searchString !== "") {
          step = structuredClone(baseStep);
          step.parts.push({
            type: "copy",
            text: `"${searchString}"`,
            side: "tail",
          });
        } else {
          step = baseStep;
        }

        section.steps.push(step, ...gemSteps);
      }
    }

    if (section.steps.length > 0) route.sections.push(section);
  }

  return route;
});

const ACTIVE_EDGE_VERSION = 0;
const activeEdgeIndex = persistentAtom("active-edge", [0], ACTIVE_EDGE_VERSION);
// Session-only: historical log snapshots must not create a startup warning.
const lastObservedAreaAtom = atom<string | null>(null);

export function edgeId(edgeIndex: number) {
  return `edge-${edgeIndex}`;
}

export const activeEdgeAtom = atom(
  (get) => get(activeEdgeIndex),
  async (get, set, value: string | typeof RESET) => {
    if (value === RESET) {
      set(activeEdgeIndex, RESET);
      return;
    }

    const edges = (await get(routeSelector)).edges;
    const currentEdgeIndex = get(activeEdgeAtom)[0];

    let messageAreaId = null;
    const matches = /Generating level \d+ area "([^"\r\n]+)"/.exec(value);
    if (matches !== null) {
      messageAreaId = matches[1];
    }

    if (messageAreaId !== null) {
      set(lastObservedAreaAtom, messageAreaId);
      const result = resolveAreaProgress(
        edges,
        currentEdgeIndex,
        messageAreaId,
      );
      if (result.reason === "advanced") set(activeEdgeIndex, [result.index]);
    }
  },
);

// Deriving this from the cursor also clears a resolved warning after an explicit
// manual selection/sync, without coupling desktop focus or lock state to it.
export const routeDeviationAtom = atom(async (get) => {
  const detected = get(lastObservedAreaAtom);
  if (detected === null) return null;
  const edges = (await get(routeSelector)).edges;
  return routeDeviation(edges, get(activeEdgeAtom)[0], detected);
});

export const nextEdgeAtom = transientAtomFamily((param: number | null) => {
  if (param === null) return atom(null, () => {});
  return atom(
    (get) => get(activeEdgeAtom)[0] + 1 == param,
    (_get, set) => {
      set(activeEdgeIndex, [param]);
    },
  );
});

const scrollBehaviour = atom<ScrollBehavior | null>("instant");
export const scrollToActiveEdgeEffect = atomEffect((get, set) => {
  const behavior = get(scrollBehaviour);
  if (behavior === null) {
    return;
  }

  const edgeIndex = get.peek(activeEdgeIndex);
  const element = document.getElementById(edgeId(edgeIndex[0]));

  if (element) {
    requestAnimationFrame(() => {
      scrollToRouteEntry(element, behavior);
    });

    set(scrollBehaviour, null);
  }
});

observe((get, set) => {
  const behavior = get(activeEdgeIndex)[0] === 0 ? "instant" : "smooth";
  set(scrollBehaviour, (prev) => prev ?? behavior);
});
