import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('chapters')
export class Chapter {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ default: 1 })
  currentChapter: number

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
