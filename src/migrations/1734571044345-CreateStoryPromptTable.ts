import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateStoryPromptTable1734571044345 implements MigrationInterface {
  name = 'CreateStoryPromptTable1734571044345'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`tweet\` (\`id\` int NOT NULL AUTO_INCREMENT, \`tweetId\` varchar(255) NOT NULL, \`content\` text NOT NULL, \`mediaId\` varchar(255) NULL, \`mediaUrl\` varchar(255) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`chapter\` int NULL, \`caption\` varchar(255) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    )
    await queryRunner.query(
      `CREATE TABLE \`prompt\` (\`id\` int NOT NULL AUTO_INCREMENT, \`systemMessage\` text NOT NULL, \`greeting\` text NULL, \`isActive\` tinyint NOT NULL DEFAULT 1, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    )
    await queryRunner.query(
      `CREATE TABLE \`story_prompt\` (\`id\` int NOT NULL AUTO_INCREMENT, \`systemMessage\` text NOT NULL, \`userPrompt\` text NOT NULL, \`isActive\` tinyint NOT NULL DEFAULT 0, \`name\` varchar(255) NULL, \`description\` varchar(255) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`story_prompt\``)
    await queryRunner.query(`DROP TABLE \`prompt\``)
    await queryRunner.query(`DROP TABLE \`tweet\``)
  }
}
