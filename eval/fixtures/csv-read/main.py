import csv
with open("missing.csv") as f:
    print(list(csv.DictReader(f)))
