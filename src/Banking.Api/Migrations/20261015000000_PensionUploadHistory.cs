using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Banking.Api.Migrations
{
    /// <inheritdoc />
    public partial class PensionUploadHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PensionSourceKey",
                table: "WealthRecords",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PensionDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Hash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    MediaType = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ProtectedOriginal = table.Column<byte[]>(type: "varbinary(max)", nullable: false),
                    ByteLength = table.Column<int>(type: "int", nullable: false),
                    Synthetic = table.Column<bool>(type: "bit", nullable: false),
                    DemoScope = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false, defaultValue: ""),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PensionDocuments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PensionUploads",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UploadedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ParserVersion = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ErrorCode = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    PreviewJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SnapshotId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DemoScope = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false, defaultValue: ""),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PensionUploads", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PensionUploads_PensionDocuments_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "PensionDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PensionSnapshots",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UploadId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AsOf = table.Column<DateOnly>(type: "date", nullable: false),
                    ApprovedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReviewHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    CoverageKey = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    DataJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SupersedesId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DemoScope = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false, defaultValue: ""),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PensionSnapshots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PensionSnapshots_PensionUploads_UploadId",
                        column: x => x.UploadId,
                        principalTable: "PensionUploads",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WealthRecords_DemoScope_PensionSourceKey",
                table: "WealthRecords",
                columns: new[] { "DemoScope", "PensionSourceKey" },
                unique: true,
                filter: "[PensionSourceKey] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PensionDocuments_DemoScope_Hash",
                table: "PensionDocuments",
                columns: new[] { "DemoScope", "Hash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PensionSnapshots_DemoScope_AsOf",
                table: "PensionSnapshots",
                columns: new[] { "DemoScope", "AsOf" });

            migrationBuilder.CreateIndex(
                name: "IX_PensionSnapshots_DemoScope_DocumentId_ReviewHash",
                table: "PensionSnapshots",
                columns: new[] { "DemoScope", "DocumentId", "ReviewHash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PensionSnapshots_UploadId",
                table: "PensionSnapshots",
                column: "UploadId");

            migrationBuilder.CreateIndex(
                name: "IX_PensionUploads_DocumentId",
                table: "PensionUploads",
                column: "DocumentId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PensionSnapshots");

            migrationBuilder.DropTable(
                name: "PensionUploads");

            migrationBuilder.DropTable(
                name: "PensionDocuments");

            migrationBuilder.DropIndex(
                name: "IX_WealthRecords_DemoScope_PensionSourceKey",
                table: "WealthRecords");

            migrationBuilder.DropColumn(
                name: "PensionSourceKey",
                table: "WealthRecords");
        }
    }
}
