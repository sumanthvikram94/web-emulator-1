module.exports = {
     /*============================================================
    Enable SSL
        0: None
        1: Implicit TLS
        2: Explicit TLS
        3: SSH
    SSL Client Version
        0x00000001: SSL v3
        0x00000002: TLS v1.0
        0x00000003: SSH v2
        0x00000004: TLS v1.1
        0x00000005: TLS v1.2
    Invalid Cert Action
        0x00000000: Always Reject
        0x00000001: Ask Before Accepting
        0x00000002: Always Accept
    Check Certificate Revocation:
        0: Do Not Check
        1: Server Certificate Only
        2: Server and Chain Certificates
        3: Server,Chain and Root Certificates
    Cipher Suite
    ========================================================*/
    bzw2h: {
        security: {
            types: {
                '0': 'none',
                '1': 'implicit',
                '2': 'explicit',
                '3': 'ssh' 
            },
            types_ftp:{
                '0': 'none',
                '1': 'explicit',
                '2': 'implicit',
                '3': 'sftp'

            },
            vtVersions: {
                '0x00000001': 'v3',
                '0x00000002': 'v1.0',
                '0x00000003': 'v2',
                '0x00000004': 'v1.1',
                '0x00000005': 'v1.2',
                '0x00000006': 'v1.3'
            },
            versions: {
                '0x00000001': 'v3',
                '0x00000002': 'v1.0',
                '0x00000003': 'v1.1',
                '0x00000004': 'v1.2',
                '0x00000005': 'v1.3'
            },
            invalidCerts: {
                '0x00000000': 'reject',
                '0x00000001': 'ask',
                '0x00000002': 'accept'  
            },
            certificates: {
                '0': 'not',
                '1': 'server',
                '2': 'chain',
                '3': 'root'
            },
            ciphers: {
                'Strong only': 'strong',
                'AES 256': 'aes256',
                'AES 128': 'aes128',
                'RC4': 'rc4',
                '3DES': 'des3',
                'AES': 'aes',
                'Blowfish': 'blowfish',
                '3DES': 'des3',
                'DES': 'des'
            }
        },
        types: {
            3270: {
                'IBM-3278-2-E': '3270Model2',
                'IBM-3278-3-E': '3270Model3',
                'IBM-3278-4-E': '3270Model4',
                'IBM-3278-5-E': '3270Model5',
                'IBM-DYNAMIC': '3270dynamic',
                'IBM-3279-2-E_3279': '3270Model2_3279',
                'IBM-3279-3-E_3279': '3270Model3_3279',
                'IBM-3279-4-E_3279': '3270Model4_3279',
                'IBM-3279-5-E_3279': '3270Model5_3279',
                'IBM-DYNAMIC_3279': '3270dynamic_3279',
            },
            p3270: {
                'IBM-3287-1': '3287Model2'
            },
            5250: {
              '0': '5250Model3179-2',
              '1' : '5250Model3180-2',
              '2' : '5250Model3196-A1',
              '3': '5250Model3477-FC',
              '4' : '5250Model3477-FG',
              '5' : '5250Model5251-11',
              '6' : '5250Model5291-1',
              '7' : '5250Model5292-2',
              '8' : '5250Model5555-B01',
              '9' : '5250Model5555-C01-132',
              '10': '5250Model5555-C01-80'
            },
            p5250: {
                '0': '3812Model1',
                '3': '5553ModelB01'
            },
            vt: {
                '0':  'VT52',
                '1':  'VT100',
                '2':  'VT220',
                '3':  'VT320',
                '4':  'VT420',
                '5':  'VT_SCOANSI',
                '6':  'VT_WYSE60',
                '7':  'VT_WYSE60/AIF',
                '8':  'VT_VAX/AIX',
                '9':  'VT_HP2392A',
                '10': 'VT_HP70092/6',
                '11': 'VT_HP70094/8',
                '12': 'VTlinux',
                '13': 'VT_IBM3151'
            },
            6530: {
                '14':  'TANDEM'
            },
            FTP:{
                '0':    'FTP_IBM_AS400',
                '1':    'FTP_IBM_MVS',
                '2':    'FTP_IBM_VM',
                '3':    'FTP_IBM_VSE',
                '4':    'FTP_UNIX',
                '5':    'FTP_Windows_NT',
                '6':    'FTP_Auto_Detect',
                '7':    'FTP_VMS',
                '8':    'FTP_NetWare',
                '9':    'FTP_VOS',
                '10':   'FTP_Tandem',
                '11':    'FTP',
                '12':    'SFTP',
                '13':    'FTPS',
                '14':    'FTPES'

            }
        }
    }
}