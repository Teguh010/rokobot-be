import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateStoryPrompt1734566239945 implements MigrationInterface {
    name = 'CreateStoryPrompt1734566239945'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`story_prompt\` (\`id\` int NOT NULL AUTO_INCREMENT, \`systemMessage\` text NOT NULL, \`userPrompt\` text NOT NULL, \`isActive\` tinyint NOT NULL DEFAULT 0, \`name\` varchar(255) NULL, \`description\` varchar(255) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE \`story_prompt\``);
    }

}
