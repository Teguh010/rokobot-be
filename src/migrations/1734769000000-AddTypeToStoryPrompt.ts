import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddTypeToStoryPrompt1734769000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE story_prompts 
      ADD COLUMN type ENUM('story', 'terror') NOT NULL DEFAULT 'story'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE story_prompts 
      DROP COLUMN type
    `)
  }
}
