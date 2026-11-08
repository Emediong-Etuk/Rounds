/**
 * Demo catalog, not a medical reference.
 *
 * Everything here is seed data for the hackathon demo. Pharmacy names,
 * addresses and phone numbers are fictional; they must never be swapped for
 * real businesses, because Rounds would then make stock claims about them.
 * `rxRequired` is set conservatively (true when unsure).
 */

export type SeedArea = {
  id: string;
  name: string;
  city: "Port Harcourt" | "Uyo";
  lat: number;
  lng: number;
};

export const SEED_AREAS: SeedArea[] = [
  // Port Harcourt (approximate centroids, ~1 km)
  { id: "area_rumuola", name: "Rumuola", city: "Port Harcourt", lat: 4.837, lng: 7.011 },
  { id: "area_gra2", name: "GRA Phase 2", city: "Port Harcourt", lat: 4.813, lng: 7.004 },
  { id: "area_oldgra", name: "Old GRA", city: "Port Harcourt", lat: 4.78, lng: 7.007 },
  { id: "area_transamadi", name: "Trans-Amadi", city: "Port Harcourt", lat: 4.815, lng: 7.045 },
  { id: "area_dline", name: "D-Line", city: "Port Harcourt", lat: 4.795, lng: 7.015 },
  { id: "area_rumuokoro", name: "Rumuokoro", city: "Port Harcourt", lat: 4.87, lng: 6.997 },
  { id: "area_choba", name: "Choba", city: "Port Harcourt", lat: 4.893, lng: 6.9 },
  { id: "area_elelenwo", name: "Elelenwo", city: "Port Harcourt", lat: 4.84, lng: 7.07 },
  { id: "area_rumuibekwe", name: "Rumuibekwe", city: "Port Harcourt", lat: 4.83, lng: 7.035 },
  { id: "area_woji", name: "Woji", city: "Port Harcourt", lat: 4.825, lng: 7.06 },
  // Uyo
  { id: "area_ewet", name: "Ewet Housing", city: "Uyo", lat: 5.02, lng: 7.91 },
  { id: "area_iturd", name: "Itu Road", city: "Uyo", lat: 5.052, lng: 7.92 },
  { id: "area_akard", name: "Aka Road", city: "Uyo", lat: 5.015, lng: 7.935 },
  { id: "area_oronrd", name: "Oron Road", city: "Uyo", lat: 5.025, lng: 7.945 },
  { id: "area_nwaniba", name: "Nwaniba Road", city: "Uyo", lat: 5.035, lng: 7.965 },
  { id: "area_shelter", name: "Shelter Afrique", city: "Uyo", lat: 5.005, lng: 7.905 },
  { id: "area_useoffot", name: "Use Offot", city: "Uyo", lat: 5.0, lng: 7.955 },
  { id: "area_ikotekpene", name: "Ikot Ekpene Road", city: "Uyo", lat: 5.045, lng: 7.89 },
];

export type VirtualPersona =
  | "fast_pidgin"
  | "price_quoter"
  | "out_with_eta"
  | "alternative"
  | "silent"
  | "confused";

export type SeedPharmacy = {
  id: string;
  name: string;
  areaId: string;
  /** Offset from the area centroid in km (east, north), to spread pins. */
  offsetKm: [number, number];
  street: string;
  phone: string;
  connectCode: string;
  isVirtual?: boolean;
  persona?: VirtualPersona;
};

export const SEED_PHARMACIES: SeedPharmacy[] = [
  // Port Harcourt — virtual demo pharmacies (auto-reply)
  { id: "ph_greenleaf", name: "Greenleaf Pharmacy", areaId: "area_rumuola", offsetKm: [0.6, 0.9], street: "12 Example Street", phone: "+2340000000101", connectCode: "GRNLF1", isVirtual: true, persona: "fast_pidgin" },
  { id: "ph_mercyplus", name: "Mercy Plus Pharmacy", areaId: "area_rumuola", offsetKm: [-0.9, 0.4], street: "4 Sample Close", phone: "+2340000000102", connectCode: "MRCYP1", isVirtual: true, persona: "price_quoter" },
  { id: "ph_riverscare", name: "Rivers Care Chemist", areaId: "area_rumuibekwe", offsetKm: [0.2, -0.3], street: "27 Demo Avenue", phone: "+2340000000103", connectCode: "RVCAR1", isVirtual: true, persona: "out_with_eta" },
  { id: "ph_brightday", name: "Bright Day Pharmacy", areaId: "area_gra2", offsetKm: [0.4, 0.5], street: "9 Placeholder Road", phone: "+2340000000104", connectCode: "BRDAY1", isVirtual: true, persona: "alternative" },
  { id: "ph_sunrise", name: "Sunrise Health Store", areaId: "area_rumuola", offsetKm: [1.4, -0.8], street: "33 Mock Lane", phone: "+2340000000105", connectCode: "SNRSE1", isVirtual: true, persona: "silent" },
  { id: "ph_kindway", name: "Kindway Pharmacy", areaId: "area_rumuokoro", offsetKm: [-0.3, -1.2], street: "2 Fictional Crescent", phone: "+2340000000106", connectCode: "KNDWY1", isVirtual: true, persona: "confused" },
  // Port Harcourt — demo phone pharmacies (connect a real Telegram account)
  { id: "ph_oakline", name: "Oakline Pharmacy", areaId: "area_rumuola", offsetKm: [0.1, -0.5], street: "18 Example Street", phone: "+2340000000107", connectCode: "OAKLN7" },
  { id: "ph_palmcourt", name: "Palm Court Chemist", areaId: "area_rumuola", offsetKm: [-0.4, 1.3], street: "6 Sample Road", phone: "+2340000000108", connectCode: "PLMCT8" },
  { id: "ph_harbourmed", name: "Harbour Meds Pharmacy", areaId: "area_gra2", offsetKm: [-0.6, -0.2], street: "41 Demo Close", phone: "+2340000000109", connectCode: "HRBMD9" },
  // Port Harcourt — directory only (not yet connected)
  { id: "ph_garden", name: "Garden City Drugstore", areaId: "area_dline", offsetKm: [0.3, 0.2], street: "15 Mock Street", phone: "+2340000000110", connectCode: "GRDNC0" },
  { id: "ph_trustwell", name: "Trustwell Pharmacy", areaId: "area_transamadi", offsetKm: [-0.5, 0.4], street: "88 Placeholder Avenue", phone: "+2340000000111", connectCode: "TRSTW1" },
  { id: "ph_lifespring", name: "Lifespring Chemist", areaId: "area_woji", offsetKm: [0.2, -0.4], street: "7 Sample Lane", phone: "+2340000000112", connectCode: "LFSPR2" },
  { id: "ph_choba", name: "Campus Gate Pharmacy", areaId: "area_choba", offsetKm: [0.1, 0.1], street: "1 Demo Junction", phone: "+2340000000113", connectCode: "CMPGT3" },
  { id: "ph_elelenwo", name: "New Dawn Pharmacy", areaId: "area_elelenwo", offsetKm: [-0.2, 0.3], street: "23 Fictional Road", phone: "+2340000000114", connectCode: "NWDWN4" },
  // Uyo — virtual demo pharmacies
  { id: "uy_ibomhealth", name: "Ibom Health Pharmacy", areaId: "area_ewet", offsetKm: [0.5, 0.6], street: "10 Example Road", phone: "+2340000000201", connectCode: "IBMHL1", isVirtual: true, persona: "fast_pidgin" },
  { id: "uy_cornerstone", name: "Cornerstone Pharmacy", areaId: "area_ewet", offsetKm: [-0.7, 0.2], street: "5 Sample Street", phone: "+2340000000202", connectCode: "CRNST2", isVirtual: true, persona: "price_quoter" },
  { id: "uy_akwacare", name: "Akwa Care Chemist", areaId: "area_akard", offsetKm: [0.3, -0.2], street: "19 Demo Avenue", phone: "+2340000000203", connectCode: "AKWCR3", isVirtual: true, persona: "out_with_eta" },
  { id: "uy_goodshepherd", name: "Good Shepherd Pharmacy", areaId: "area_oronrd", offsetKm: [-0.2, 0.4], street: "30 Mock Close", phone: "+2340000000204", connectCode: "GDSHP4", isVirtual: true, persona: "alternative" },
  { id: "uy_silverline", name: "Silverline Pharmacy", areaId: "area_iturd", offsetKm: [0.4, -0.6], street: "3 Placeholder Lane", phone: "+2340000000205", connectCode: "SLVLN5", isVirtual: true, persona: "silent" },
  { id: "uy_unity", name: "Unity Drugs", areaId: "area_shelter", offsetKm: [0.6, 0.3], street: "8 Fictional Avenue", phone: "+2340000000206", connectCode: "UNTYD6", isVirtual: true, persona: "confused" },
  // Uyo — directory only
  { id: "uy_nwaniba", name: "Riverside Pharmacy", areaId: "area_nwaniba", offsetKm: [0.0, 0.2], street: "14 Example Close", phone: "+2340000000207", connectCode: "RVRSD7" },
  { id: "uy_useoffot", name: "Hopewell Chemist", areaId: "area_useoffot", offsetKm: [0.3, 0.1], street: "21 Sample Road", phone: "+2340000000208", connectCode: "HPWLL8" },
  { id: "uy_ikotekpene", name: "Royal Cross Pharmacy", areaId: "area_ikotekpene", offsetKm: [-0.3, 0.2], street: "11 Demo Street", phone: "+2340000000209", connectCode: "RYLCR9" },
  { id: "uy_itu", name: "Morningstar Pharmacy", areaId: "area_iturd", offsetKm: [-0.4, 0.3], street: "45 Mock Road", phone: "+2340000000210", connectCode: "MRNST0" },
];

export type SeedDrug = {
  id: string;
  genericName: string;
  strength: string | null;
  form: "inhaler" | "tablet" | "capsule" | "syrup" | "injection" | "sachet";
  brandNames: string[];
  aliases: string[];
  rxRequired: boolean;
  controlled?: boolean;
  /** Plausible demo price range in naira, used by virtual pharmacies. */
  priceRange: [number, number];
};

export const SEED_DRUGS: SeedDrug[] = [
  { id: "drug_salbutamol_inh", genericName: "Salbutamol", strength: "100mcg", form: "inhaler", brandNames: ["Ventolin", "Asthalin"], aliases: ["albuterol", "asthma inhaler", "blue inhaler", "puffer"], rxRequired: true, priceRange: [3000, 4500] },
  { id: "drug_salbutamol_tab", genericName: "Salbutamol", strength: "4mg", form: "tablet", brandNames: ["Ventolin tablets"], aliases: ["albuterol tablet"], rxRequired: true, priceRange: [300, 800] },
  { id: "drug_coartem", genericName: "Artemether/Lumefantrine", strength: "20/120mg", form: "tablet", brandNames: ["Coartem", "Lonart", "Amatem"], aliases: ["act", "malaria drug", "antimalarial", "artemether", "lumefantrine"], rxRequired: false, priceRange: [1800, 3500] },
  { id: "drug_augmentin", genericName: "Amoxicillin/Clavulanate", strength: "625mg", form: "tablet", brandNames: ["Augmentin"], aliases: ["co-amoxiclav", "amoxiclav"], rxRequired: true, priceRange: [4500, 8000] },
  { id: "drug_amoxil", genericName: "Amoxicillin", strength: "500mg", form: "capsule", brandNames: ["Amoxil"], aliases: ["amoxyl", "amoxicilin"], rxRequired: true, priceRange: [800, 1800] },
  { id: "drug_paracetamol", genericName: "Paracetamol", strength: "500mg", form: "tablet", brandNames: ["Panadol", "Emzor Paracetamol"], aliases: ["acetaminophen", "pcm"], rxRequired: false, priceRange: [200, 800] },
  { id: "drug_ibuprofen", genericName: "Ibuprofen", strength: "400mg", form: "tablet", brandNames: ["Brufen"], aliases: [], rxRequired: false, priceRange: [400, 1200] },
  { id: "drug_diclofenac", genericName: "Diclofenac", strength: "50mg", form: "tablet", brandNames: ["Voltaren", "Cataflam"], aliases: ["diclo"], rxRequired: true, priceRange: [500, 1500] },
  { id: "drug_metronidazole", genericName: "Metronidazole", strength: "400mg", form: "tablet", brandNames: ["Flagyl"], aliases: [], rxRequired: true, priceRange: [300, 900] },
  { id: "drug_ciprofloxacin", genericName: "Ciprofloxacin", strength: "500mg", form: "tablet", brandNames: ["Ciprotab", "Ciproxin"], aliases: ["cipro"], rxRequired: true, priceRange: [800, 2500] },
  { id: "drug_azithromycin", genericName: "Azithromycin", strength: "500mg", form: "tablet", brandNames: ["Zithromax"], aliases: ["azithro", "z-pak"], rxRequired: true, priceRange: [1500, 4000] },
  { id: "drug_septrin", genericName: "Co-trimoxazole", strength: "960mg", form: "tablet", brandNames: ["Septrin"], aliases: ["cotrimoxazole", "sulfamethoxazole trimethoprim"], rxRequired: true, priceRange: [400, 1200] },
  { id: "drug_metformin", genericName: "Metformin", strength: "500mg", form: "tablet", brandNames: ["Glucophage"], aliases: [], rxRequired: true, priceRange: [800, 2500] },
  { id: "drug_glibenclamide", genericName: "Glibenclamide", strength: "5mg", form: "tablet", brandNames: ["Daonil"], aliases: ["glyburide"], rxRequired: true, priceRange: [500, 1500] },
  { id: "drug_mixtard", genericName: "Human insulin 70/30", strength: "100IU/ml", form: "injection", brandNames: ["Mixtard"], aliases: ["insulin", "mixtard 30"], rxRequired: true, priceRange: [6500, 12000] },
  { id: "drug_amlodipine5", genericName: "Amlodipine", strength: "5mg", form: "tablet", brandNames: ["Norvasc"], aliases: [], rxRequired: true, priceRange: [600, 2000] },
  { id: "drug_amlodipine10", genericName: "Amlodipine", strength: "10mg", form: "tablet", brandNames: ["Norvasc"], aliases: [], rxRequired: true, priceRange: [900, 2800] },
  { id: "drug_lisinopril", genericName: "Lisinopril", strength: "10mg", form: "tablet", brandNames: ["Zestril"], aliases: [], rxRequired: true, priceRange: [900, 2500] },
  { id: "drug_losartan", genericName: "Losartan", strength: "50mg", form: "tablet", brandNames: ["Cozaar"], aliases: [], rxRequired: true, priceRange: [1200, 3500] },
  { id: "drug_nifedipine", genericName: "Nifedipine retard", strength: "20mg", form: "tablet", brandNames: [], aliases: ["nifedipine"], rxRequired: true, priceRange: [500, 1500] },
  { id: "drug_hctz", genericName: "Hydrochlorothiazide", strength: "25mg", form: "tablet", brandNames: [], aliases: ["hctz"], rxRequired: true, priceRange: [300, 900] },
  { id: "drug_atorvastatin", genericName: "Atorvastatin", strength: "20mg", form: "tablet", brandNames: ["Lipitor"], aliases: [], rxRequired: true, priceRange: [1500, 4500] },
  { id: "drug_omeprazole", genericName: "Omeprazole", strength: "20mg", form: "capsule", brandNames: ["Losec"], aliases: [], rxRequired: false, priceRange: [500, 1500] },
  { id: "drug_esomeprazole", genericName: "Esomeprazole", strength: "40mg", form: "tablet", brandNames: ["Nexium"], aliases: [], rxRequired: true, priceRange: [2500, 6000] },
  { id: "drug_cetirizine", genericName: "Cetirizine", strength: "10mg", form: "tablet", brandNames: ["Zyrtec"], aliases: [], rxRequired: false, priceRange: [300, 1200] },
  { id: "drug_loratadine", genericName: "Loratadine", strength: "10mg", form: "tablet", brandNames: ["Claritin"], aliases: [], rxRequired: false, priceRange: [400, 1500] },
  { id: "drug_piriton", genericName: "Chlorphenamine", strength: "4mg", form: "tablet", brandNames: ["Piriton"], aliases: ["chlorpheniramine"], rxRequired: false, priceRange: [150, 500] },
  { id: "drug_buscopan", genericName: "Hyoscine butylbromide", strength: "10mg", form: "tablet", brandNames: ["Buscopan"], aliases: ["hyoscine"], rxRequired: false, priceRange: [1200, 2800] },
  { id: "drug_montelukast", genericName: "Montelukast", strength: "10mg", form: "tablet", brandNames: ["Singulair"], aliases: [], rxRequired: true, priceRange: [2000, 5000] },
  { id: "drug_prednisolone", genericName: "Prednisolone", strength: "5mg", form: "tablet", brandNames: [], aliases: ["pred"], rxRequired: true, priceRange: [200, 800] },
  { id: "drug_levothyroxine", genericName: "Levothyroxine", strength: "50mcg", form: "tablet", brandNames: [], aliases: ["thyroxine", "eltroxin"], rxRequired: true, priceRange: [1500, 4000] },
  { id: "drug_carbamazepine", genericName: "Carbamazepine", strength: "200mg", form: "tablet", brandNames: ["Tegretol"], aliases: [], rxRequired: true, priceRange: [1500, 4000] },
  { id: "drug_fluconazole", genericName: "Fluconazole", strength: "150mg", form: "capsule", brandNames: ["Diflucan"], aliases: [], rxRequired: true, priceRange: [600, 2000] },
  { id: "drug_albendazole", genericName: "Albendazole", strength: "400mg", form: "tablet", brandNames: ["Zentel"], aliases: ["dewormer", "worm medicine"], rxRequired: false, priceRange: [300, 1000] },
  { id: "drug_fansidar", genericName: "Sulfadoxine/Pyrimethamine", strength: "500/25mg", form: "tablet", brandNames: ["Fansidar"], aliases: ["sp", "sulfadoxine", "pyrimethamine"], rxRequired: true, priceRange: [400, 1200] },
  { id: "drug_folic", genericName: "Folic acid", strength: "5mg", form: "tablet", brandNames: [], aliases: ["folate"], rxRequired: false, priceRange: [100, 400] },
  { id: "drug_ferrous", genericName: "Ferrous sulfate", strength: "200mg", form: "tablet", brandNames: [], aliases: ["iron tablet", "ferrous sulphate"], rxRequired: false, priceRange: [150, 500] },
  { id: "drug_ors", genericName: "Oral rehydration salts", strength: null, form: "sachet", brandNames: [], aliases: ["ors", "rehydration"], rxRequired: false, priceRange: [100, 400] },
  { id: "drug_zinc", genericName: "Zinc", strength: "20mg", form: "tablet", brandNames: [], aliases: ["zinc sulfate"], rxRequired: false, priceRange: [200, 700] },
  { id: "drug_vitc", genericName: "Vitamin C", strength: "100mg", form: "tablet", brandNames: [], aliases: ["ascorbic acid"], rxRequired: false, priceRange: [100, 500] },
  // Controlled / abuse-prone: present only so the refusal path can be shown.
  { id: "drug_tramadol", genericName: "Tramadol", strength: "50mg", form: "capsule", brandNames: [], aliases: ["tramol"], rxRequired: true, controlled: true, priceRange: [0, 0] },
  { id: "drug_codeine", genericName: "Codeine cough syrup", strength: null, form: "syrup", brandNames: [], aliases: ["codeine"], rxRequired: true, controlled: true, priceRange: [0, 0] },
];
