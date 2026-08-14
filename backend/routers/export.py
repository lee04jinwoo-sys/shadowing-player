import os
import tempfile
import csv
import io
import logging
import genanki
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/export")

def remove_file(path: str):
    try:
        if os.path.exists(path):
            os.unlink(path)
    except Exception as e:
        logger.error(f"Failed to delete temp file {path}: {e}")

class ExportItem(BaseModel):
    sentence: str
    translation: str = ""
    source: str = ""

class ExportRequest(BaseModel):
    items: list[ExportItem]
    deck_name: str = "Shadowing Player Deck"

@router.post("/apkg")
def export_apkg(data: ExportRequest, background_tasks: BackgroundTasks):
    if not data.items:
        raise HTTPException(status_code=400, detail="No items to export")
    
    try:
        # Use fixed model_id and deterministic deck_id based on deck_name
        import zlib
        model_id = 1607392319
        deck_id = (zlib.crc32(data.deck_name.encode('utf-8')) % 1000000000) + 1000000000

        my_model = genanki.Model(
            model_id,
            'Shadowing Player Sentence Model',
            fields=[
                {'name': 'English'},
                {'name': 'Korean'},
                {'name': 'Source'},
            ],
            templates=[
                {
                    'name': 'Card 1',
                    'qfmt': '''
                    <div style="font-family: 'Inter', -apple-system, sans-serif; font-size: 22px; font-weight: 600; text-align: center; color: #1e293b; padding: 20px;">
                        {{English}}
                    </div>
                    ''',
                    'afmt': '''
                    <div style="font-family: 'Inter', -apple-system, sans-serif; font-size: 22px; font-weight: 600; text-align: center; color: #1e293b; padding: 20px;">
                        {{English}}
                    </div>
                    <hr id="answer" style="border: none; border-top: 1px solid #e2e8f0; margin: 10px 0;">
                    <div style="font-family: 'Inter', -apple-system, sans-serif; font-size: 17px; text-align: center; color: #475569; padding: 10px;">
                        {{Korean}}
                    </div>
                    {{#Source}}
                    <div style="font-family: monospace; font-size: 12px; text-align: center; color: #94a3b8; margin-top: 15px;">
                        📍 {{Source}}
                    </div>
                    {{/Source}}
                    ''',
                },
            ],
            css='''
            .card {
                background-color: #ffffff;
                border-radius: 12px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }
            '''
        )

        my_deck = genanki.Deck(deck_id, data.deck_name)

        for item in data.items:
            note = genanki.Note(
                model=my_model,
                fields=[item.sentence, item.translation or "", item.source or ""]
            )
            my_deck.add_note(note)

        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".apkg")
        genanki.Package(my_deck).write_to_file(temp_file.name)
        temp_file.close()

        background_tasks.add_task(remove_file, temp_file.name)

        return FileResponse(
            temp_file.name,
            filename="Shadowing_Sentences.apkg",
            media_type="application/apkg",
            headers={"Content-Disposition": "attachment; filename=Shadowing_Sentences.apkg"}
        )
    except Exception as e:
        logger.error(f"Error generating APKG: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/csv")
def export_csv(data: ExportRequest):
    if not data.items:
        raise HTTPException(status_code=400, detail="No items to export")
    
    try:
        output = io.StringIO()
        # UTF-8 BOM for Excel compatibility
        output.write('\ufeff')
        writer = csv.writer(output)
        writer.writerow(["English", "Korean", "Source"])
        for item in data.items:
            writer.writerow([item.sentence, item.translation or "", item.source or ""])
        
        csv_content = output.getvalue()
        return Response(
            content=csv_content.encode('utf-8'),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": "attachment; filename=Shadowing_Sentences.csv"}
        )
    except Exception as e:
        logger.error(f"Error generating CSV: {e}")
        raise HTTPException(status_code=500, detail=str(e))
