import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity()
export class Prompt {
  @PrimaryGeneratedColumn()
  id: number

  @Column('text')
  systemMessage: string

  @Column('text', { nullable: true })
  greeting?: string

  @Column({ default: true })
  isActive: boolean

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
