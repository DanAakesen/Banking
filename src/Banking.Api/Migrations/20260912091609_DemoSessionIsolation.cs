using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Banking.Api.Migrations
{
    /// <inheritdoc />
    public partial class DemoSessionIsolation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Categories_Name",
                table: "Categories");

            migrationBuilder.DropIndex(
                name: "IX_BudgetPlans_IsActive",
                table: "BudgetPlans");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "Transfers",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "Transactions",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "Rules",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "ReviewActions",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "Jobs",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "ImportItems",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "Goals",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "Connections",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "ClassificationChanges",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "Categories",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "Budgets",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "BudgetPlans",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "BudgetEntries",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "Balances",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "Authorizations",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "Accounts",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DemoScope",
                table: "AccountAliases",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_Categories_DemoScope_Name",
                table: "Categories",
                columns: new[] { "DemoScope", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BudgetPlans_DemoScope_IsActive",
                table: "BudgetPlans",
                columns: new[] { "DemoScope", "IsActive" },
                unique: true,
                filter: "[IsActive] = 1");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Categories_DemoScope_Name",
                table: "Categories");

            migrationBuilder.DropIndex(
                name: "IX_BudgetPlans_DemoScope_IsActive",
                table: "BudgetPlans");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "Transfers");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "Transactions");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "Rules");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "ReviewActions");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "Jobs");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "ImportItems");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "Goals");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "Connections");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "ClassificationChanges");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "Categories");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "Budgets");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "BudgetPlans");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "BudgetEntries");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "Balances");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "Authorizations");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "DemoScope",
                table: "AccountAliases");

            migrationBuilder.CreateIndex(
                name: "IX_Categories_Name",
                table: "Categories",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BudgetPlans_IsActive",
                table: "BudgetPlans",
                column: "IsActive",
                unique: true,
                filter: "[IsActive] = 1");
        }
    }
}
