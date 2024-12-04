import { MigrationInterface, QueryRunner } from 'typeorm'

export class UpdateTweetContentColumn1701648000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tweet MODIFY COLUMN content TEXT`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE tweet MODIFY COLUMN content VARCHAR(255)`,
    )
  }
}
