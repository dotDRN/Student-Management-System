import { ReactionType } from "@prisma/client";

export interface AddReactionDto {
    reaction: ReactionType;
}