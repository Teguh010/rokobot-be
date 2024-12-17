import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGreetingToPrompt1734442337351 implements MigrationInterface {
    name = 'AddGreetingToPrompt1734442337351'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`prompt\` ADD \`greeting\` text NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`prompt\` DROP COLUMN \`greeting\``);
    }

}
