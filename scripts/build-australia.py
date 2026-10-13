"""Import every OzTiVo channel entry; this source contains guide IDs, not streams."""
from pathlib import Path
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
REVISION = '30c4f48f5b92d699d189133fcc8de4f4db952177'
SOURCE = f'https://raw.githubusercontent.com/awiouy/webgrabplus/{REVISION}/config/siteini.pack/Australia/oztivo.net.channels.xml'

def import_channels(xml):
    document = ET.fromstring(xml)
    if document.tag != 'site' or document.get('site') != 'oztivo.net':
        raise ValueError('Expected OzTiVo site channel configuration')
    channels, seen = [], set()
    for channel in document.findall('./channels/channel'):
        site_id = (channel.get('site_id') or '').strip()
        guide_id = (channel.get('xmltv_id') or '').strip()
        name = (channel.text or '').strip()
        if not site_id or not guide_id or not name or site_id in seen:
            raise ValueError('Missing or duplicate channel identifiers')
        seen.add(site_id)
        channels.append({'siteId': site_id, 'guideId': guide_id, 'name': name})
    if not channels:
        raise ValueError('Empty channel configuration')
    return {'country': 'Australia', 'site': 'oztivo.net', 'source': SOURCE,
            'revision': REVISION, 'channels': channels}

if __name__ == '__main__':
    data = import_channels((ROOT / 'channel-sources/oztivo.net.channels.xml').read_bytes())
    (ROOT / 'public/data/australia.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(f"Imported {len(data['channels'])} Australian channel entries (guide metadata only)")
