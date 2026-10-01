using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Banking.Api.Migrations
{
    /// <inheritdoc />
    public partial class GoalGallery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ContributionDay",
                table: "Goals",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<decimal>(
                name: "MonthlyContribution",
                table: "Goals",
                type: "decimal(19,4)",
                precision: 19,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhotoDataUrl",
                table: "Goals",
                type: "nvarchar(max)",
                maxLength: 60000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ContributionDay",
                table: "Goals");

            migrationBuilder.DropColumn(
                name: "MonthlyContribution",
                table: "Goals");

            migrationBuilder.DropColumn(
                name: "PhotoDataUrl",
                table: "Goals");
        }
    }
}
