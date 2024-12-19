import { MigrationInterface, QueryRunner } from 'typeorm'

export class SkipAddGreetingToPrompt1734571044346
  implements MigrationInterface
{
  name = 'SkipAddGreetingToPrompt1734571044346'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Skip karena kolom sudah ada
    return Promise.resolve()
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    return Promise.resolve()
  }
}
