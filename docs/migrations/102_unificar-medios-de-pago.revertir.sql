-- REVERSIÓN EXACTA de la migración 102 (por si hiciera falta).
-- Los ids se capturaron en producción el 28-08-2026 ANTES de unificar.
-- Ojo: si desde entonces se editó el medio de pago de alguna de estas
-- transacciones a mano, esta reversión la pisaría igual.

UPDATE public.payment_transactions SET payment_method = 'Deposito'
 WHERE id IN (47,197,234,242);

UPDATE public.payment_transactions SET payment_method = 'Tarjeta de credito'
 WHERE id IN (272,275,276);

UPDATE public.payment_transactions SET payment_method = 'Transferencia bancaria'
 WHERE id IN (29,30,31,32,33,34,40,41,42,43,44,45,46,48,49,50,51,52,53,54,55,56,57,58,59,60,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,94,95,96,97,98,100,101,105,106,134,135,136,141,146,148,149,150,163,165,166,169,170,178,182,183,184,185,186,187,188,189,190,191,192,199,200,201,202,205,206,207,214,216,218,219,220,221,222,228,229,231,232,233,239,240,241,243,244,245,246,249,250,251,253,255,256,257,258,259,262,263,264,266,267,271,273,274,277,278,279,280,282,283,284,285,286,288,289,290,291,292,293,294,295,297,298,299,300,301,302,303,305,309,310,311,312,313,314,315,316,317,318,319,320,321,322,323,328,329,330,331,335,336,337,338,339,340,341,342,343,344,345,346,349,350,351,353,354,355,356,357,358,359,360,361,362,363,364,373,374,375);
