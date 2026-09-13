from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import pandas as pd
import joblib

app = FastAPI(title="NYC Listing Room-Type Predictor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

COLUMNS = [
    "latitude", "longitude", "price", "minimum_nights", "number_of_reviews",
    "reviews_per_month", "calculated_host_listings_count", "availability_365",
    "neighbourhood_group", "neighbourhood",
]

model = joblib.load("Model_Pipeline.pkl")

# Pull the class labels straight off the trained pipeline so the frontend
# never has to hardcode them and always matches predict_proba's column order.
try:
    CLASS_LABELS = model.classes_.tolist()
except AttributeError:
    CLASS_LABELS = model.named_steps[list(model.named_steps.keys())[-1]].classes_.tolist()


class Features(BaseModel):
    latitude: float = Field(..., ge=-90, le=90, description="Latitude coordinate")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude coordinate")
    price: float = Field(..., gt=0, description="Price per night, must be positive")
    minimum_nights: int = Field(..., ge=1, le=365, description="Minimum nights required for booking")
    number_of_reviews: int = Field(..., ge=0, description="Total number of reviews received")
    reviews_per_month: float = Field(..., ge=0, description="Average reviews per month")
    calculated_host_listings_count: int = Field(..., ge=0, description="Number of listings by this host")
    availability_365: int = Field(..., ge=0, le=365, description="Days available out of 365")
    neighbourhood_group: str = Field(..., min_length=1, description="Borough or neighbourhood group")
    neighbourhood: str = Field(..., min_length=1, description="Specific neighbourhood name")


@app.get("/")
def greet():
    return {"message": "Room-type prediction API is running."}


@app.post("/predict")
def predict(features: Features):
    try:
        row = pd.DataFrame([features.dict()], columns=COLUMNS)
        prediction = model.predict(row)
        probability = model.predict_proba(row)[0].tolist()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Prediction failed: {exc}")

    return {
        "Predicted_room_type": prediction[0],
        "Probablity": probability,
        "classes": CLASS_LABELS,
    }
