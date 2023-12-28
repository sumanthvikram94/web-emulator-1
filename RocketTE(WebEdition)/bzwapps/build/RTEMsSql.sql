USE [bluezone];
DROP TABLE IF EXISTS BzwUsers;

/***** Create table 'BzwUsers' with password columns  *****/
/***** Authentication method and Identity source both are mssql *****/
CREATE TABLE BzwUsers(
	[UserId] [varchar](255) NOT NULL,
	[Password] [varchar](255) NULL,
	[salt][varchar](255)  NULL,
	[iv][varchar](255)  NULL,
	[UserName] [varchar](255) NULL,
	[Email] [varchar](255) NULL,
	[UserGroup] [varchar](255) NULL,
	[Phone] [varchar](255) NULL,
	[LU1] [varchar](255) NULL,
	[LU2] [varchar](255) NULL,
	[LU3] [varchar](255) NULL,
	[LU4] [varchar](255) NULL,
	[LU5] [varchar](255) NULL,
	[LU6] [varchar](255) NULL,
	[LU7] [varchar](255) NULL,
	[LU8] [varchar](255) NULL,
	[LU9] [varchar](255) NULL,
	[LU10] [varchar](255) NULL,
	[LU11] [varchar](255) NULL,
	[LU12] [varchar](255) NULL,
	[LU13] [varchar](255) NULL,
	[LU14] [varchar](255) NULL,
	[LU15] [varchar](255) NULL,
	[LU16] [varchar](255) NULL,
	[LU17] [varchar](255) NULL,
	[LU18] [varchar](255) NULL,
	[LU19] [varchar](255) NULL,
	[LU20] [varchar](255) NULL,
	[LU21] [varchar](255) NULL,
	[LU22] [varchar](255) NULL,
	[LU23] [varchar](255) NULL,
	[LU24] [varchar](255) NULL,
	[LU25] [varchar](255) NULL,
	[LU26] [varchar](255) NULL,
	[LU27] [varchar](255) NULL,
	[LU28] [varchar](255) NULL,
	[LU29] [varchar](255) NULL,
	[LU30] [varchar](255) NULL,
	[LU31] [varchar](255) NULL,
	[LU32] [varchar](255) NULL
) 


/***** Create table 'BzwUsers' without password columns  *****/
/***** Authentication method is LDAP and Identity source is mssql *****/

/*
  CREATE TABLE BzwUsers(
	 [UserId] [varchar](255) NOT NULL,
	 [UserName] [varchar](255) NULL,
	 [Email] [varchar](255) NULL,
	 [UserGroup] [varchar](255) NULL,
	 [Phone] [varchar](255) NULL,
	 [LU1] [varchar](255) NULL,
	 [LU2] [varchar](255) NULL,
	 [LU3] [varchar](255) NULL,
	 [LU4] [varchar](255) NULL,
	 [LU5] [varchar](255) NULL,
	 [LU6] [varchar](255) NULL,
	 [LU7] [varchar](255) NULL,
	 [LU8] [varchar](255) NULL,
	 [LU9] [varchar](255) NULL,
	 [LU10] [varchar](255) NULL,
	 [LU11] [varchar](255) NULL,
	 [LU12] [varchar](255) NULL,
	 [LU13] [varchar](255) NULL,
	 [LU14] [varchar](255) NULL,
	 [LU15] [varchar](255) NULL,
	 [LU16] [varchar](255) NULL,
	 [LU17] [varchar](255) NULL,
	 [LU18] [varchar](255) NULL,
	 [LU19] [varchar](255) NULL,
	 [LU20] [varchar](255) NULL,
	 [LU21] [varchar](255) NULL,
	 [LU22] [varchar](255) NULL,
	 [LU23] [varchar](255) NULL,
	 [LU24] [varchar](255) NULL,
	 [LU25] [varchar](255) NULL,
	 [LU26] [varchar](255) NULL,
	 [LU27] [varchar](255) NULL,
	 [LU28] [varchar](255) NULL,
	 [LU29] [varchar](255) NULL,
	 [LU30] [varchar](255) NULL,
	 [LU31] [varchar](255) NULL,
	 [LU32] [varchar](255) NULL
 ) 
 */







