export class CreatePromptDto {
  systemMessage: string
  isActive?: boolean
}

export class UpdatePromptDto {
  systemMessage?: string
  isActive?: boolean
}
