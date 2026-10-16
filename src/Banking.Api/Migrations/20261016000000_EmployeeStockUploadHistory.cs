using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Banking.Api.Migrations
{
    /// <inheritdoc />
    public partial class EmployeeStockUploadHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "StockSourceKey",
                table: "WealthRecords",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EmployeeStockDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Hash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ByteLength = table.Column<int>(type: "int", nullable: false),
                    Synthetic = table.Column<bool>(type: "bit", nullable: false),
                    ProtectedOriginal = table.Column<byte[]>(type: "varbinary(max)", nullable: false),
                    DemoScope = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false, defaultValue: ""),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmployeeStockDocuments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EmployeeStockUploads",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UploadedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ParserVersion = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ErrorCode = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    PreviewJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SourceIdentityKey = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    SnapshotId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DemoScope = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false, defaultValue: ""),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmployeeStockUploads", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EmployeeStockUploads_EmployeeStockDocuments_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "EmployeeStockDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EmployeeStockSnapshots",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UploadId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AsOf = table.Column<DateOnly>(type: "date", nullable: false),
                    ApprovedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReviewHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    SourceIdentityKey = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    DataJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SupersedesId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    WealthRecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DemoScope = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false, defaultValue: ""),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmployeeStockSnapshots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EmployeeStockSnapshots_EmployeeStockDocuments_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "EmployeeStockDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EmployeeStockSnapshots_EmployeeStockUploads_UploadId",
                        column: x => x.UploadId,
                        principalTable: "EmployeeStockUploads",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WealthRecords_DemoScope_StockSourceKey",
                table: "WealthRecords",
                columns: new[] { "DemoScope", "StockSourceKey" },
                unique: true,
                filter: "[StockSourceKey] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_EmployeeStockDocuments_DemoScope_Hash",
                table: "EmployeeStockDocuments",
                columns: new[] { "DemoScope", "Hash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EmployeeStockSnapshots_DemoScope_AsOf",
                table: "EmployeeStockSnapshots",
                columns: new[] { "DemoScope", "AsOf" });

            migrationBuilder.CreateIndex(
                name: "IX_EmployeeStockSnapshots_DemoScope_DocumentId_ReviewHash",
                table: "EmployeeStockSnapshots",
                columns: new[] { "DemoScope", "DocumentId", "ReviewHash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EmployeeStockSnapshots_DemoScope_SupersedesId",
                table: "EmployeeStockSnapshots",
                columns: new[] { "DemoScope", "SupersedesId" },
                unique: true,
                filter: "[SupersedesId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_EmployeeStockSnapshots_DocumentId",
                table: "EmployeeStockSnapshots",
                column: "DocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_EmployeeStockSnapshots_UploadId",
                table: "EmployeeStockSnapshots",
                column: "UploadId");

            migrationBuilder.CreateIndex(
                name: "IX_EmployeeStockUploads_DocumentId",
                table: "EmployeeStockUploads",
                column: "DocumentId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EmployeeStockSnapshots");

            migrationBuilder.DropTable(
                name: "EmployeeStockUploads");

            migrationBuilder.DropTable(
                name: "EmployeeStockDocuments");

            migrationBuilder.DropIndex(
                name: "IX_WealthRecords_DemoScope_StockSourceKey",
                table: "WealthRecords");

            migrationBuilder.DropColumn(
                name: "StockSourceKey",
                table: "WealthRecords");
        }
    }
}
