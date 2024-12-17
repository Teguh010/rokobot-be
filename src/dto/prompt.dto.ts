export class CreatePromptDto {
  systemMessage: string
  greeting?: string
  isActive?: boolean
}

export class UpdatePromptDto {
  systemMessage?: string
  greeting?: string
  isActive?: boolean
}
