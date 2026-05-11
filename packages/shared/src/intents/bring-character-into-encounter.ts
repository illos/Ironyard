import { z } from 'zod';
import { ParticipantSchema } from '../participant';

export const BringCharacterIntoEncounterPayloadSchema = z.object({
  participant: ParticipantSchema,
});
export type BringCharacterIntoEncounterPayload = z.infer<
  typeof BringCharacterIntoEncounterPayloadSchema
>;
