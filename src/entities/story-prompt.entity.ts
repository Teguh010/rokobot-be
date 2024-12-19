import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity()
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
}
