using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Banking.Api.Migrations
{
    /// <inheritdoc />
    public partial class BudgetCategoryLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CategoryId",
                table: "BudgetEntries",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_BudgetEntries_CategoryId",
                table: "BudgetEntries",
                column: "CategoryId");

            migrationBuilder.AddForeignKey(
                name: "FK_BudgetEntries_Categories_CategoryId",
                table: "BudgetEntries",
                column: "CategoryId",
                principalTable: "Categories",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BudgetEntries_Categories_CategoryId",
                table: "BudgetEntries");

            migrationBuilder.DropIndex(
                name: "IX_BudgetEntries_CategoryId",
                table: "BudgetEntries");

            migrationBuilder.DropColumn(
                name: "CategoryId",
                table: "BudgetEntries");
        }
    }
}
