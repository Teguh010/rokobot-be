export class CreateStoryPromptDto {
  systemMessage: string
  userPrompt: string
  name?: string
  description?: string
  isActive?: boolean
}

export class UpdateStoryPromptDto {
  systemMessage?: string
  userPrompt?: string
  name?: string
  description?: string
  isActive?: boolean
}