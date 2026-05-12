import {
  AbilityFileSchema,
  AncestryFileSchema,
  AncestrySchema,
  CareerFileSchema,
  CareerSchema,
  ClassFileSchema,
  ClassSchema,
  ComplicationFileSchema,
  ComplicationSchema,
  ItemFileSchema,
  KitFileSchema,
  TitleFileSchema,
} from '@ironyard/shared';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { ApiError } from './client';

// Fetch a static JSON file from /data/ and validate it against the provided schema.
async function fetchData<T>(filename: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`/data/${filename}`);
  if (!res.ok) {
    throw new ApiError(res.status, `${filename}: ${res.statusText}`);
  }
  const json = (await res.json()) as unknown;
  return schema.parse(json);
}

// Static data never changes between deploys — long stale time, no focus refetch.
const STATIC = {
  staleTime: 60 * 60_000,
  refetchOnWindowFocus: false,
} as const;

export function useAncestries() {
  return useQuery({
    queryKey: ['data', 'ancestries'],
    queryFn: async () => {
      const file = await fetchData('ancestries.json', AncestryFileSchema);
      return file.ancestries;
    },
    ...STATIC,
  });
}

export function useCareers() {
  return useQuery({
    queryKey: ['data', 'careers'],
    queryFn: async () => {
      const file = await fetchData('careers.json', CareerFileSchema);
      return file.careers;
    },
    ...STATIC,
  });
}

export function useClasses() {
  return useQuery({
    queryKey: ['data', 'classes'],
    queryFn: async () => {
      const file = await fetchData('classes.json', ClassFileSchema);
      return file.classes;
    },
    ...STATIC,
  });
}

export function useComplications() {
  return useQuery({
    queryKey: ['data', 'complications'],
    queryFn: async () => {
      const file = await fetchData('complications.json', ComplicationFileSchema);
      return file.complications;
    },
    ...STATIC,
  });
}

export function useKits() {
  return useQuery({
    queryKey: ['data', 'kits'],
    queryFn: async () => {
      const file = await fetchData('kits.json', KitFileSchema);
      return file.kits;
    },
    ...STATIC,
  });
}

export function useAbilities() {
  return useQuery({
    queryKey: ['data', 'abilities'],
    queryFn: async () => {
      const file = await fetchData('abilities.json', AbilityFileSchema);
      return file.abilities;
    },
    ...STATIC,
  });
}

export function useItems() {
  return useQuery({
    queryKey: ['data', 'items'],
    queryFn: async () => {
      const file = await fetchData('items.json', ItemFileSchema);
      return file.items;
    },
    ...STATIC,
  });
}

export function useTitles() {
  return useQuery({
    queryKey: ['data', 'titles'],
    queryFn: async () => {
      const file = await fetchData('titles.json', TitleFileSchema);
      return file.titles;
    },
    ...STATIC,
  });
}

// ── Composite ─────────────────────────────────────────────────────────────────
//
// WizardStaticData bundles all five data sets into map-of-maps for O(1) lookup
// by id. Returns null while any of the five underlying queries are still loading
// so the wizard shell can gate rendering behind a single null check.

// Derive item types from the hook return values so the Map value types align
// with what the hooks actually produce (inclusive of Zod `.default()` handling).
type AncestryItem = NonNullable<ReturnType<typeof useAncestries>['data']>[number];
type CareerItem = NonNullable<ReturnType<typeof useCareers>['data']>[number];
type ClassItem = NonNullable<ReturnType<typeof useClasses>['data']>[number];
type ComplicationItem = NonNullable<ReturnType<typeof useComplications>['data']>[number];
type KitItem = NonNullable<ReturnType<typeof useKits>['data']>[number];
type AbilityItem = NonNullable<ReturnType<typeof useAbilities>['data']>[number];
type ItemEntry = NonNullable<ReturnType<typeof useItems>['data']>[number];
type TitleItem = NonNullable<ReturnType<typeof useTitles>['data']>[number];

export type WizardStaticData = {
  ancestries: ReadonlyMap<string, AncestryItem>;
  careers: ReadonlyMap<string, CareerItem>;
  classes: ReadonlyMap<string, ClassItem>;
  complications: ReadonlyMap<string, ComplicationItem>;
  kits: ReadonlyMap<string, KitItem>;
  abilities: ReadonlyMap<string, AbilityItem>;
  items: ReadonlyMap<string, ItemEntry>;
  titles: ReadonlyMap<string, TitleItem>;
};

export function useWizardStaticData(): WizardStaticData | null {
  const a = useAncestries();
  const ca = useCareers();
  const cl = useClasses();
  const co = useComplications();
  const k = useKits();
  const ab = useAbilities();
  const it = useItems();
  const ti = useTitles();

  if (!a.data || !ca.data || !cl.data || !co.data || !k.data || !ab.data || !it.data || !ti.data) {
    return null;
  }

  return {
    ancestries: new Map(a.data.map((x) => [x.id, x])),
    careers: new Map(ca.data.map((x) => [x.id, x])),
    classes: new Map(cl.data.map((x) => [x.id, x])),
    complications: new Map(co.data.map((x) => [x.id, x])),
    kits: new Map(k.data.map((x) => [x.id, x])),
    abilities: new Map(ab.data.map((x) => [x.id, x])),
    items: new Map(it.data.map((x) => [x.id, x])),
    titles: new Map(ti.data.map((x) => [x.id, x])),
  };
}
