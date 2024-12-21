import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'
import { PostType } from '../enums/post-type.enum'

@Entity('story_prompts')
export class StoryPrompt {
  @PrimaryGeneratedColumn()
  id: number

  @Column('text')
  systemMessage: string

  @Column('text')
  userPrompt: string

  @Column({ default: false })
  isActive: boolean

  @Column({ nullable: true })
  name: string

  @Column({ nullable: true })
  description: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @Column({
    type: 'enum',
    enum: PostType,
    default: PostType.STORY,
  })
  type: PostType
}
