using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Banking.Api.Migrations
{
    /// <inheritdoc />
    public partial class BankMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BankDetailsJson",
                table: "Transactions",
                type: "nvarchar(max)",
                maxLength: 12000,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "BankDetailsImportedAt",
                table: "Accounts",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BankDetailsJson",
                table: "Accounts",
                type: "nvarchar(max)",
                maxLength: 12000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BankDetailsJson",
                table: "Transactions");

            migrationBuilder.DropColumn(
                name: "BankDetailsImportedAt",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "BankDetailsJson",
                table: "Accounts");
        }
    }
}
