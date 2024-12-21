import { PostType } from '../enums/post-type.enum'

export class CreateStoryPromptDto {
  systemMessage: string
  userPrompt: string
  isActive?: boolean
  name?: string
  description?: string
  type: PostType
}

export class UpdateStoryPromptDto {
  systemMessage?: string
  userPrompt?: string
  isActive?: boolean
  name?: string
  description?: string
  type?: PostType
}
