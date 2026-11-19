# Recognition test: real photos → model server → music

Run on 18 November 2026 with 27 free-licence photos from Wikimedia Commons (thumbnails, 640 px),
sent to `team8-chroma-model.onrender.com`, then through the music engine (`buildScore`).

## Result: the place was right for 9 of 27 photos

| Photo | Should be | Model says | Confidence | Music |
|---|---|---|---|---|
| Club Tigerheat on the Dance Floor with Laser Lights.jpg | club | ✗ green | 0.49 | minimal piano         65 bpm  D# ionian |
| Barcelona - Sala Razzmatazz.jpg | club | ✗ green | 0.62 | minimal piano         67 bpm  G harmonic |
| Gràcia metro station in Barcelona, platform 3.jpg | transit | ✓ transit | 0.31 | electro              121 bpm  C# ionian |
| Gràcia metro station of Barcelona, platform 3.jpg | transit | ✓ transit | 0.41 | techno               135 bpm  D lydian |
| Barcelona Peu del Funicular metro station (interior).jpg | transit | ✗ green | 0.40 | minimal piano         72 bpm  D ionian |
| Line 3 platform at Diagonal station in Barcelona.jpg | transit | ✗ market | 0.42 | cumbia               103 bpm  C# mixolydian |
| Boqueria, Barcelona (P1170750).jpg | market | ✓ market | 0.42 | cumbia               105 bpm  C# ionian |
| Boqueria, Barcelona (P1170751).jpg | market | ✓ market | 0.31 | afro groove          110 bpm  C lydian |
| Boqueria, Barcelona (P1170746).jpg | market | ✗ transit | 0.51 | electro              116 bpm  C# lydian |
| Boqueria, Barcelona (P1170749).jpg | market | ✗ green | 0.40 | classical             82 bpm  C# ionian |
| Large sign with beach rules and information at Barceloneta b | waterfront | ✓ waterfront | 0.51 | ambient               66 bpm  G phrygian |
| Promenade and beach, Platja de la Barceloneta, Barcelona, 20 | waterfront | ✗ green | 0.59 | classical             74 bpm  G aeolian |
| Morning walk, Platja de la Barceloneta, Barcelona, 2015.jpg | waterfront | ✗ green | 0.60 | neo-classical pulse   96 bpm  G lydian |
| Bike rack in the form of massive steel cable rings at Barcel | waterfront | ✗ green | 0.59 | neo-classical pulse  102 bpm  C# lydian |
| Parc de la Ciutadella Barcelona Mai 2013.jpg | green | ✓ green | 0.50 | neo-classical pulse   97 bpm  G ionian |
| Barcelona Parc Ciutadella cascada.jpg | green | ✓ green | 0.60 | minimal piano         67 bpm  G phrygian |
| Artur Aldomà - El gos abandonat - Parc de la Ciutadella (Bar | green | ✓ green | 0.31 | folk                 101 bpm  D ionian |
| Monument al General Prim, Parc de la Ciutadella 2734.jpg | green | ✗ waterfront | 0.49 | balearic house       116 bpm  G harmonic |
| Barcelona - Nacht - Placa Reial 004.jpg | square | ✗ transit | 0.31 | minimal techno       128 bpm  C# mixolydian |
| Plaça Reial, 8 Restaurant MariscCO.jpg | square | ✗ transit | 0.30 | minimal techno       121 bpm  D mixolydian |
| Barcelona - Plaça Reial - View SSE.jpg | square | ✗ green | 0.80 | neo-classical pulse   93 bpm  G dorian |
| Barcelona - Plaça Reial - View SE.jpg | square | ✗ green | 0.61 | neo-classical pulse  107 bpm  C# ionian |
| Passeig de Gràcia and Carrer de Provença crossroads seen fro | street | ✗ green | 0.91 | minimal piano         69 bpm  G dorian |
| Festa Major de Gràcia 2011 - XIII cercavila de cultura popul | street | ✓ street | 0.70 | jazzhop               89 bpm  C# aeolian |
| Barcelona - Passeig de Gràcia - View NW towards Carrer Gran  | street | ✗ waterfront | 0.40 | drone                 56 bpm  G mixolydian |
| Barcelona - Passeig de Gràcia - View NW towards Carrer Gran  | street | ✗ waterfront | 0.40 | downtempo             79 bpm  G phrygian |
| Registratur Nightclub Munich Dance Floor.jpg | club | ✗ street | 0.41 | boom bap              89 bpm  C# ionian |

Per place: green 3/4, transit 2/4, market 2/4, waterfront 1/4, street 1/4, square 0/4, club 0/3.
The model says **green** for 12 of 27 photos. A club dance floor with lasers at night came back as green, daytime.
No card had `indoor`, `paving` or `details`.

## If the place is right, the music works

Club photos forced to `club`, 40 versions each: house, deep house, acid techno and drum & bass all appear;
drum & bass reaches 177–181 bpm. Station photos give techno, minimal techno, electro or dub techno.

## Photos and licences

- `club_1.jpg`: Club Tigerheat on the Dance Floor with Laser Lights.jpg (CC BY-SA 4.0), Wikimedia Commons
- `club_4.jpg`: Barcelona - Sala Razzmatazz.jpg (CC0), Wikimedia Commons
- `transit_1.jpg`: Gràcia metro station in Barcelona, platform 3.jpg (CC BY 4.0), Wikimedia Commons
- `transit_2.jpg`: Gràcia metro station of Barcelona, platform 3.jpg (CC BY 4.0), Wikimedia Commons
- `transit_3.jpg`: Barcelona Peu del Funicular metro station (interior).jpg (CC0), Wikimedia Commons
- `transit_4.jpg`: Line 3 platform at Diagonal station in Barcelona.jpg (CC BY 4.0), Wikimedia Commons
- `market_1.jpg`: Boqueria, Barcelona (P1170750).jpg (CC BY-SA 4.0), Wikimedia Commons
- `market_2.jpg`: Boqueria, Barcelona (P1170751).jpg (CC BY-SA 4.0), Wikimedia Commons
- `market_3.jpg`: Boqueria, Barcelona (P1170746).jpg (CC BY-SA 4.0), Wikimedia Commons
- `market_4.jpg`: Boqueria, Barcelona (P1170749).jpg (CC BY-SA 4.0), Wikimedia Commons
- `waterfront_1.jpg`: Large sign with beach rules and information at Barceloneta beach in Barcelona, Spain (2022).jpg (CC BY-SA 4.0), Wikimedia Commons
- `waterfront_2.jpg`: Promenade and beach, Platja de la Barceloneta, Barcelona, 2015.jpg (CC0), Wikimedia Commons
- `waterfront_3.jpg`: Morning walk, Platja de la Barceloneta, Barcelona, 2015.jpg (CC0), Wikimedia Commons
- `waterfront_4.jpg`: Bike rack in the form of massive steel cable rings at Barceloneta beach in Barcelona, Spain.jpg (CC BY-SA 4.0), Wikimedia Commons
- `green_1.jpg`: Parc de la Ciutadella Barcelona Mai 2013.jpg (CC BY 3.0), Wikimedia Commons
- `green_2.jpg`: Barcelona Parc Ciutadella cascada.jpg (CC BY-SA 3.0), Wikimedia Commons
- `green_3.jpg`: Artur Aldomà - El gos abandonat - Parc de la Ciutadella (Barcelona).JPG (Public domain), Wikimedia Commons
- `green_4.jpg`: Monument al General Prim, Parc de la Ciutadella 2734.jpg (CC BY-SA 4.0), Wikimedia Commons
- `square_1.jpg`: Barcelona - Nacht - Placa Reial 004.jpg (CC BY-SA 4.0), Wikimedia Commons
- `square_2.jpg`: Plaça Reial, 8 Restaurant MariscCO.jpg (CC BY-SA 4.0), Wikimedia Commons
- `square_3.jpg`: Barcelona - Plaça Reial - View SSE.jpg (CC BY-SA 4.0), Wikimedia Commons
- `square_4.jpg`: Barcelona - Plaça Reial - View SE.jpg (CC BY-SA 4.0), Wikimedia Commons
- `street_1.jpg`: Passeig de Gràcia and Carrer de Provença crossroads seen from Casa Milà, Barcelona, 2023.jpg (CC0), Wikimedia Commons
- `street_2.jpg`: Festa Major de Gràcia 2011 - XIII cercavila de cultura popular - carrer Gran P1330050.jpg (CC BY-SA 3.0), Wikimedia Commons
- `street_3.jpg`: Barcelona - Passeig de Gràcia - View NW towards Carrer Gran de Gràcia II.jpg (CC BY-SA 4.0), Wikimedia Commons
- `street_4.jpg`: Barcelona - Passeig de Gràcia - View NW towards Carrer Gran de Gràcia I.jpg (CC BY-SA 4.0), Wikimedia Commons
- `club_2.jpg`: Registratur Nightclub Munich Dance Floor.jpg (?), Wikimedia Commons
