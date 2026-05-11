import {
  AncestryFileSchema,
  AncestrySchema,
  CareerFileSchema,
  CareerSchema,
  ClassFileSchema,
  ClassSchema,
  ComplicationFileSchema,
  ComplicationSchema,
} from '@ironyard/shared';
import { ResolvedKitSchema } from '@ironyard/rules';
import type { ResolvedKit } from '@ironyard/rules';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
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
    queryFn: () => fetchData('kits.json', z.array(ResolvedKitSchema)),
    ...STATIC,
  });
}

// ── Composite ─────────────────────────────────────────────────────────────────
//
// WizardStaticData bundles all five data sets into map-of-maps for O(1) lookup
// by id. Returns null while any of the five underlying queries are still loading
// so the wizard shell can gate rendering behind a single null check.

// Derive the item types from the query return values so that the Map value
// types align with what the hooks actually produce (including Zod defaults).
// Derive item types from the hook return values so the Map value types align
// with what the hooks actually produce (inclusive of Zod `.default()` handling).
type AncestryItem = NonNullable<ReturnType<typeof useAncestries>['data']>[number];
type CareerItem = NonNullable<ReturnType<typeof useCareers>['data']>[number];
type ClassItem = NonNullable<ReturnType<typeof useClasses>['data']>[number];
type ComplicationItem = NonNullable<ReturnType<typeof useComplications>['data']>[number];
type KitItem = NonNullable<ReturnType<typeof useKits>['data']>[number];

export type WizardStaticData = {
  ancestries: ReadonlyMap<string, AncestryItem>;
  careers: ReadonlyMap<string, CareerItem>;
  classes: ReadonlyMap<string, ClassItem>;
  complications: ReadonlyMap<string, ComplicationItem>;
  kits: ReadonlyMap<string, KitItem>;
};

export function useWizardStaticData(): WizardStaticData | null {
  const a = useAncestries();
  const ca = useCareers();
  const cl = useClasses();
  const co = useComplications();
  const k = useKits();

  if (!a.data || !ca.data || !cl.data || !co.data || !k.data) return null;

  return {
    ancestries: new Map(a.data.map((x) => [x.id, x])),
    careers: new Map(ca.data.map((x) => [x.id, x])),
    classes: new Map(cl.data.map((x) => [x.id, x])),
    complications: new Map(co.data.map((x) => [x.id, x])),
    kits: new Map(k.data.map((x) => [x.id, x])),
  };
}
