import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm'

@Entity()
export class Tweet {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  tweetId: string

  @Column('text')
  content: string

  @Column({ nullable: true })
  mediaId: string

  @Column({ nullable: true })
  mediaUrl: string

  @CreateDateColumn()
  createdAt: Date

  @Column({ nullable: true })
  chapter: number

  @Column({ nullable: true })
  caption: string
}
