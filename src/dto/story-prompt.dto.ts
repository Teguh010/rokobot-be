export class CreateStoryPromptDto {
  systemMessage: string
  userPrompt: string
  isActive?: boolean
  name?: string
  description?: string
}

export class UpdateStoryPromptDto {
  systemMessage?: string
  userPrompt?: string
  isActive?: boolean
  name?: string
  description?: string
}
