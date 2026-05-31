IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'LuckyReels')
    CREATE DATABASE LuckyReels;
GO

USE LuckyReels;
GO

-- ── USR_Players ───────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'USR_Players')
CREATE TABLE USR_Players (
    ID              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    Name            NVARCHAR(20)        NOT NULL,
    Email           NVARCHAR(254)       NOT NULL,
    PasswordHash    NVARCHAR(60)        NOT NULL,
    Tokens          INT                 NOT NULL DEFAULT 0,
    LastBonusAt     DATETIME2           NULL,
    CreatedAt       DATETIME2           NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT pk_USR_Players       PRIMARY KEY (ID),
    CONSTRAINT uq_USR_Players_Name  UNIQUE      (Name),
    CONSTRAINT uq_USR_Players_Email UNIQUE      (Email)
);
GO

-- ── USR_Admins ────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'USR_Admins')
CREATE TABLE USR_Admins (
    ID              INT             NOT NULL IDENTITY(1,1),
    Username        NVARCHAR(40)    NOT NULL,
    Email           NVARCHAR(254)   NOT NULL,
    PasswordHash    NVARCHAR(60)    NOT NULL,
    CONSTRAINT pk_USR_Admins            PRIMARY KEY (ID),
    CONSTRAINT uq_USR_Admins_Username   UNIQUE      (Username),
    CONSTRAINT uq_USR_Admins_Email      UNIQUE      (Email)
);
GO

-- ── USR_Sessions ──────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'USR_Sessions')
CREATE TABLE USR_Sessions (
    Token       UNIQUEIDENTIFIER    NOT NULL,
    PlayerID    UNIQUEIDENTIFIER    NOT NULL,
    CreatedAt   DATETIME2           NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT pk_USR_Sessions          PRIMARY KEY (Token),
    CONSTRAINT fk_USR_Sessions_Player   FOREIGN KEY (PlayerID) REFERENCES USR_Players(ID) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_USR_Sessions_Player' AND object_id = OBJECT_ID('USR_Sessions'))
    CREATE INDEX idx_USR_Sessions_Player ON USR_Sessions (PlayerID);
GO

-- ── LOG_Spin ──────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LOG_Spin')
CREATE TABLE LOG_Spin (
    ID          BIGINT              NOT NULL IDENTITY(1,1),
    PlayerID    UNIQUEIDENTIFIER    NOT NULL,
    MachineNum  TINYINT             NOT NULL,
    Symbols     NVARCHAR(40)        NOT NULL,
    Bet         INT                 NOT NULL,
    WinAmount   INT                 NOT NULL,
    SpinType    NVARCHAR(10)        NOT NULL,
    CreatedAt   DATETIME2           NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT pk_LOG_Spin          PRIMARY KEY (ID),
    CONSTRAINT fk_LOG_Spin_Player   FOREIGN KEY (PlayerID) REFERENCES USR_Players(ID) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_LOG_Spin_PlayerTime' AND object_id = OBJECT_ID('LOG_Spin'))
    CREATE INDEX idx_LOG_Spin_PlayerTime ON LOG_Spin (PlayerID, CreatedAt);
GO

-- ── LOG_Blackjack ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LOG_Blackjack')
CREATE TABLE LOG_Blackjack (
    ID              BIGINT              NOT NULL IDENTITY(1,1),
    PlayerID        UNIQUEIDENTIFIER    NOT NULL,
    Result          NVARCHAR(15)        NOT NULL,
    PlayerCards     NVARCHAR(120)       NOT NULL,
    DealerCards     NVARCHAR(120)       NOT NULL,
    Bet             INT                 NOT NULL,
    Net             INT                 NOT NULL,
    CreatedAt       DATETIME2           NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT pk_LOG_Blackjack         PRIMARY KEY (ID),
    CONSTRAINT fk_LOG_Blackjack_Player  FOREIGN KEY (PlayerID) REFERENCES USR_Players(ID) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_LOG_Blackjack_PlayerTime' AND object_id = OBJECT_ID('LOG_Blackjack'))
    CREATE INDEX idx_LOG_Blackjack_PlayerTime ON LOG_Blackjack (PlayerID, CreatedAt);
GO

-- ── LOG_Roulette ──────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LOG_Roulette')
CREATE TABLE LOG_Roulette (
    ID          BIGINT              NOT NULL IDENTITY(1,1),
    PlayerID    UNIQUEIDENTIFIER    NOT NULL,
    WinNum      NVARCHAR(3)         NOT NULL,
    TotalBet    INT                 NOT NULL,
    Net         INT                 NOT NULL,
    CreatedAt   DATETIME2           NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT pk_LOG_Roulette          PRIMARY KEY (ID),
    CONSTRAINT fk_LOG_Roulette_Player   FOREIGN KEY (PlayerID) REFERENCES USR_Players(ID) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_LOG_Roulette_PlayerTime' AND object_id = OBJECT_ID('LOG_Roulette'))
    CREATE INDEX idx_LOG_Roulette_PlayerTime ON LOG_Roulette (PlayerID, CreatedAt);
GO

-- ── LOG_Horse ─────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LOG_Horse')
CREATE TABLE LOG_Horse (
    ID          BIGINT              NOT NULL IDENTITY(1,1),
    PlayerID    UNIQUEIDENTIFIER    NOT NULL,
    WinnerName  NVARCHAR(30)        NOT NULL,
    PickedName  NVARCHAR(30)        NOT NULL,
    Bet         INT                 NOT NULL,
    Net         INT                 NOT NULL,
    CreatedAt   DATETIME2           NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT pk_LOG_Horse         PRIMARY KEY (ID),
    CONSTRAINT fk_LOG_Horse_Player  FOREIGN KEY (PlayerID) REFERENCES USR_Players(ID) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_LOG_Horse_PlayerTime' AND object_id = OBJECT_ID('LOG_Horse'))
    CREATE INDEX idx_LOG_Horse_PlayerTime ON LOG_Horse (PlayerID, CreatedAt);
GO

-- ── LOG_Baccarat ──────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LOG_Baccarat')
CREATE TABLE LOG_Baccarat (
    ID          BIGINT              NOT NULL IDENTITY(1,1),
    PlayerID    UNIQUEIDENTIFIER    NOT NULL,
    BetType     NVARCHAR(10)        NOT NULL,
    Outcome     NVARCHAR(10)        NOT NULL,
    PlayerHand  NVARCHAR(60)        NOT NULL,
    BankerHand  NVARCHAR(60)        NOT NULL,
    Bet         INT                 NOT NULL,
    Net         INT                 NOT NULL,
    CreatedAt   DATETIME2           NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT pk_LOG_Baccarat          PRIMARY KEY (ID),
    CONSTRAINT fk_LOG_Baccarat_Player   FOREIGN KEY (PlayerID) REFERENCES USR_Players(ID) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_LOG_Baccarat_PlayerTime' AND object_id = OBJECT_ID('LOG_Baccarat'))
    CREATE INDEX idx_LOG_Baccarat_PlayerTime ON LOG_Baccarat (PlayerID, CreatedAt);
GO

-- ── LOG_Admin ─────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LOG_Admin')
CREATE TABLE LOG_Admin (
    ID          BIGINT              NOT NULL IDENTITY(1,1),
    AdminID     INT                 NOT NULL,
    Action      NVARCHAR(30)        NOT NULL,
    TargetID    UNIQUEIDENTIFIER    NULL,
    Detail      NVARCHAR(255)       NULL,
    CreatedAt   DATETIME2           NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT pk_LOG_Admin         PRIMARY KEY (ID),
    CONSTRAINT fk_LOG_Admin_Admin   FOREIGN KEY (AdminID) REFERENCES USR_Admins(ID)
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_LOG_Admin_Time' AND object_id = OBJECT_ID('LOG_Admin'))
    CREATE INDEX idx_LOG_Admin_Time ON LOG_Admin (AdminID, CreatedAt);
GO

-- ── ERR_Error ─────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ERR_Error')
CREATE TABLE ERR_Error (
    ID          INT             NOT NULL IDENTITY(1,1),
    Date        DATETIME2       NOT NULL DEFAULT SYSDATETIME(),
    Exception   NVARCHAR(MAX)   NOT NULL,
    Message     NVARCHAR(MAX)   NOT NULL,
    Uri         NVARCHAR(500)   NOT NULL,
    Username    NVARCHAR(40)    NOT NULL,
    Host        NVARCHAR(255)   NOT NULL,
    CONSTRAINT pk_ERR_Error PRIMARY KEY (ID)
);
GO
