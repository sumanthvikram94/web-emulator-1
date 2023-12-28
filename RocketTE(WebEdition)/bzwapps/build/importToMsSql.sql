/***** import Data*************/

/****
This sql template can be used for migrating the old BlueZone Integration Server (version 7.1.x) MS SQL user data 
to the new BlueZone Web-To-Host (version 8.1.x) web application.
Before excuting, please check the database name,table name and each column name, make sure they are the same as template.
If not, do the corresponding change, then run.   
After migration, the user can use the original password to login directly when the password is not encrypted or the password encryptor is "bzW2hShaPassword".
****/

USE [bluezone];
INSERT [BzwUsers]
(          [UserId]
           ,[Password]
           ,[salt]
           ,[iv]
           ,[UserName]
           ,[Email]
           ,[UserGroup]
           ,[Phone]
           ,[LU1]
           ,[LU2]
           ,[LU3]
           ,[LU4]
           ,[LU5]
           ,[LU6]
           ,[LU7]
           ,[LU8]
           ,[LU9]
           ,[LU10]
           ,[LU11]
           ,[LU12]
           ,[LU13]
           ,[LU14]
           ,[LU15]
           ,[LU16]
           ,[LU17]
           ,[LU18]
           ,[LU19]
           ,[LU20]
           ,[LU21]
           ,[LU22]
           ,[LU23]
           ,[LU24]
           ,[LU25]
           ,[LU26]
           ,[LU27]
           ,[LU28]
           ,[LU29]
           ,[LU30]
           ,[LU31]
           ,[LU32]
)
SELECT 
	   [UserId]
      ,[Password]
	  ,''
	  ,''
	  ,''
	  ,[Email]
      ,CASE WHEN [Site] != '' then CONCAT([Site],'_',[Page]) ELSE '' END   /* import 'Site' and 'Page' into field 'UserGroup' */
      /* ,[Location]*/             /* import 'Location' into field 'UserGroup' */
	  ,''
      ,[Lu7]
      ,[Lu8]
      ,[Lu9]
      ,[Lu10]
      ,[Lu11]
      ,[Lu12]
      ,[Lu13]
      ,[Lu14]
      ,[Lu15]
      ,[Lu16]
      ,[Lu17]
      ,[Lu18]
      ,[Lu19]
      ,[Lu20]
      ,[Lu21]
      ,[Lu22]
      ,[Lu23]
      ,[Lu24]
      ,[Lu25]
      ,[Lu26]
      ,[Lu27]
      ,[Lu28]
      ,[Lu29]
      ,[Lu30]
      ,[Lu31]
      ,[Lu32]
      ,[Lu33]
      ,[Lu34]
      ,[Lu35]
      ,[Lu36]
      ,[Lu37]
      ,[Lu38]
 FROM [BzUsers]

