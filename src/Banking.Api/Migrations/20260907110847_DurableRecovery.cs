using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Banking.Api.Migrations
{
    /// <inheritdoc />
    public partial class DurableRecovery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Cursor",
                table: "Jobs",
                type: "nvarchar(max)",
                maxLength: 16000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(2000)",
                oldMaxLength: 2000,
                oldNullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastAttemptAt",
                table: "Jobs",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RetryNotBefore",
                table: "Connections",
                type: "datetimeoffset",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LastAttemptAt",
                table: "Jobs");

            migrationBuilder.DropColumn(
                name: "RetryNotBefore",
                table: "Connections");

            migrationBuilder.AlterColumn<string>(
                name: "Cursor",
                table: "Jobs",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldMaxLength: 16000,
                oldNullable: true);
        }
    }
}
