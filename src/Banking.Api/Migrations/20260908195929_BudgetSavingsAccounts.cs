using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Banking.Api.Migrations
{
    /// <inheritdoc />
    public partial class BudgetSavingsAccounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SavingsAccountId",
                table: "BudgetEntries",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_BudgetEntries_SavingsAccountId",
                table: "BudgetEntries",
                column: "SavingsAccountId");

            migrationBuilder.AddForeignKey(
                name: "FK_BudgetEntries_Accounts_SavingsAccountId",
                table: "BudgetEntries",
                column: "SavingsAccountId",
                principalTable: "Accounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BudgetEntries_Accounts_SavingsAccountId",
                table: "BudgetEntries");

            migrationBuilder.DropIndex(
                name: "IX_BudgetEntries_SavingsAccountId",
                table: "BudgetEntries");

            migrationBuilder.DropColumn(
                name: "SavingsAccountId",
                table: "BudgetEntries");
        }
    }
}
