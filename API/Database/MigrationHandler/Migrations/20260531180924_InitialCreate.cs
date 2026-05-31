using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MigrationHandler.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ERR_Error",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "(sysdatetime())"),
                    Exception = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Message = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Uri = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Host = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_ERR_Error", x => x.ID);
                });

            migrationBuilder.CreateTable(
                name: "USR_Admins",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Username = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Email = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: false),
                    PasswordHash = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_USR_Admins", x => x.ID);
                });

            migrationBuilder.CreateTable(
                name: "USR_Players",
                columns: table => new
                {
                    ID = table.Column<Guid>(type: "uniqueidentifier", nullable: false, defaultValueSql: "(newid())"),
                    Name = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Email = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: false),
                    PasswordHash = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    Tokens = table.Column<int>(type: "int", nullable: false),
                    LastBonusAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "(sysdatetime())")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_USR_Players", x => x.ID);
                });

            migrationBuilder.CreateTable(
                name: "LOG_Admin",
                columns: table => new
                {
                    ID = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AdminID = table.Column<int>(type: "int", nullable: false),
                    Action = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    TargetID = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Detail = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "(sysdatetime())")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_LOG_Admin", x => x.ID);
                    table.ForeignKey(
                        name: "fk_LOG_Admin_Admin",
                        column: x => x.AdminID,
                        principalTable: "USR_Admins",
                        principalColumn: "ID");
                });

            migrationBuilder.CreateTable(
                name: "LOG_Baccarat",
                columns: table => new
                {
                    ID = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PlayerID = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BetType = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    Outcome = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    PlayerHand = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    BankerHand = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    Bet = table.Column<int>(type: "int", nullable: false),
                    Net = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "(sysdatetime())")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_LOG_Baccarat", x => x.ID);
                    table.ForeignKey(
                        name: "fk_LOG_Baccarat_Player",
                        column: x => x.PlayerID,
                        principalTable: "USR_Players",
                        principalColumn: "ID",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LOG_Blackjack",
                columns: table => new
                {
                    ID = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PlayerID = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Result = table.Column<string>(type: "nvarchar(15)", maxLength: 15, nullable: false),
                    PlayerCards = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DealerCards = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Bet = table.Column<int>(type: "int", nullable: false),
                    Net = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "(sysdatetime())")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_LOG_Blackjack", x => x.ID);
                    table.ForeignKey(
                        name: "fk_LOG_Blackjack_Player",
                        column: x => x.PlayerID,
                        principalTable: "USR_Players",
                        principalColumn: "ID",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LOG_Horse",
                columns: table => new
                {
                    ID = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PlayerID = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WinnerName = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    PickedName = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Bet = table.Column<int>(type: "int", nullable: false),
                    Net = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "(sysdatetime())")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_LOG_Horse", x => x.ID);
                    table.ForeignKey(
                        name: "fk_LOG_Horse_Player",
                        column: x => x.PlayerID,
                        principalTable: "USR_Players",
                        principalColumn: "ID",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LOG_Roulette",
                columns: table => new
                {
                    ID = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PlayerID = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WinNum = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    TotalBet = table.Column<int>(type: "int", nullable: false),
                    Net = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "(sysdatetime())")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_LOG_Roulette", x => x.ID);
                    table.ForeignKey(
                        name: "fk_LOG_Roulette_Player",
                        column: x => x.PlayerID,
                        principalTable: "USR_Players",
                        principalColumn: "ID",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LOG_Spin",
                columns: table => new
                {
                    ID = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PlayerID = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MachineNum = table.Column<byte>(type: "tinyint", nullable: false),
                    Symbols = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Bet = table.Column<int>(type: "int", nullable: false),
                    WinAmount = table.Column<int>(type: "int", nullable: false),
                    SpinType = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "(sysdatetime())")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_LOG_Spin", x => x.ID);
                    table.ForeignKey(
                        name: "fk_LOG_Spin_Player",
                        column: x => x.PlayerID,
                        principalTable: "USR_Players",
                        principalColumn: "ID",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "USR_Sessions",
                columns: table => new
                {
                    Token = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlayerID = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "(sysdatetime())")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_USR_Sessions", x => x.Token);
                    table.ForeignKey(
                        name: "fk_USR_Sessions_Player",
                        column: x => x.PlayerID,
                        principalTable: "USR_Players",
                        principalColumn: "ID",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "idx_LOG_Admin_Time",
                table: "LOG_Admin",
                columns: new[] { "AdminID", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "idx_LOG_Baccarat_PlayerTime",
                table: "LOG_Baccarat",
                columns: new[] { "PlayerID", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "idx_LOG_Blackjack_PlayerTime",
                table: "LOG_Blackjack",
                columns: new[] { "PlayerID", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "idx_LOG_Horse_PlayerTime",
                table: "LOG_Horse",
                columns: new[] { "PlayerID", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "idx_LOG_Roulette_PlayerTime",
                table: "LOG_Roulette",
                columns: new[] { "PlayerID", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "idx_LOG_Spin_PlayerTime",
                table: "LOG_Spin",
                columns: new[] { "PlayerID", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "uq_USR_Admins_Email",
                table: "USR_Admins",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "uq_USR_Admins_Username",
                table: "USR_Admins",
                column: "Username",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "uq_USR_Players_Email",
                table: "USR_Players",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "uq_USR_Players_Name",
                table: "USR_Players",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "idx_USR_Sessions_Player",
                table: "USR_Sessions",
                column: "PlayerID");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ERR_Error");

            migrationBuilder.DropTable(
                name: "LOG_Admin");

            migrationBuilder.DropTable(
                name: "LOG_Baccarat");

            migrationBuilder.DropTable(
                name: "LOG_Blackjack");

            migrationBuilder.DropTable(
                name: "LOG_Horse");

            migrationBuilder.DropTable(
                name: "LOG_Roulette");

            migrationBuilder.DropTable(
                name: "LOG_Spin");

            migrationBuilder.DropTable(
                name: "USR_Sessions");

            migrationBuilder.DropTable(
                name: "USR_Admins");

            migrationBuilder.DropTable(
                name: "USR_Players");
        }
    }
}
