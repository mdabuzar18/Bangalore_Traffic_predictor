import os
import json
import joblib
import pandas as pd
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# Paths for model assets
MODEL_ASSETS_DIR = "model_assets"
PIPELINES_PATH = os.path.join(MODEL_ASSETS_DIR, "traffic_pipelines.joblib")
METRICS_PATH = os.path.join(MODEL_ASSETS_DIR, "metrics.json")
IMPORTANCES_PATH = os.path.join(MODEL_ASSETS_DIR, "feature_importances.json")
SUMMARY_PATH = os.path.join(MODEL_ASSETS_DIR, "data_summary.json")

# Global variables to store loaded models and metadata
pipelines = None
metrics = {}
feature_importances = {}
data_summary = {}

def load_assets():
    global pipelines, metrics, feature_importances, data_summary
    
    # Load model pipelines if they exist
    if os.path.exists(PIPELINES_PATH):
        try:
            pipelines = joblib.load(PIPELINES_PATH)
            print("Successfully loaded traffic model pipelines.")
        except Exception as e:
            print(f"Error loading model pipelines: {e}")
    else:
        print("Warning: Model pipelines not found. Please train models first using train_model.py")
        
    # Load metrics
    if os.path.exists(METRICS_PATH):
        try:
            with open(METRICS_PATH, "r") as f:
                metrics = json.load(f)
        except Exception as e:
            print(f"Error loading metrics: {e}")
            
    # Load feature importances
    if os.path.exists(IMPORTANCES_PATH):
        try:
            with open(IMPORTANCES_PATH, "r") as f:
                feature_importances = json.load(f)
        except Exception as e:
            print(f"Error loading feature importances: {e}")
            
    # Load dataset summaries for dashboard visualizations
    if os.path.exists(SUMMARY_PATH):
        try:
            with open(SUMMARY_PATH, "r") as f:
                data_summary = json.load(f)
        except Exception as e:
            print(f"Error loading data summary: {e}")

# Load assets when starting
load_assets()

@app.route('/')
def home():
    # If the assets are not loaded yet, try loading again
    if pipelines is None:
        load_assets()
        
    # Render index.html passing dataset stats, metrics, and feature importances
    return render_template(
        'index.html',
        summary=data_summary,
        metrics=metrics,
        feature_importances=feature_importances,
        models_loaded=(pipelines is not None)
    )

@app.route('/api/predict', methods=['POST'])
def predict():
    global pipelines
    if pipelines is None:
        return jsonify({
            "success": False,
            "error": "Model pipelines are not loaded on server. Please train models using train_model.py first."
        }), 500
        
    try:
        # Parse JSON request data
        data = request.json
        
        # Extract features
        area = data.get('area')
        road = data.get('road')
        weather = data.get('weather')
        roadwork = data.get('roadwork', 'No')
        volume = int(data.get('volume', 25000))
        incidents = int(data.get('incidents', 0))
        pedestrians = int(data.get('pedestrians', 100))
        date_str = data.get('date', '2026-06-26')
        
        # Parse date to extract Day of Week and Month
        dt = pd.to_datetime(date_str)
        day_of_week = dt.dayofweek
        month = dt.month
        
        # Create input DataFrame
        input_data = pd.DataFrame([{
            'Area Name': area,
            'Road/Intersection Name': road,
            'Weather Conditions': weather,
            'Roadwork and Construction Activity': roadwork,
            'Traffic Volume': volume,
            'Incident Reports': incidents,
            'Pedestrian and Cyclist Count': pedestrians,
            'Day_of_Week': day_of_week,
            'Month': month
        }])
        
        # Get predictions for all targets
        predictions = {}
        for target, pipeline in pipelines.items():
            pred = pipeline.predict(input_data)[0]
            
            # Apply logical bounds based on variable domain
            if target == 'Congestion Level':
                pred = max(0.0, min(100.0, float(pred)))
            elif target == 'Road Capacity Utilization':
                pred = max(0.0, min(100.0, float(pred)))
            elif target == 'Travel Time Index':
                pred = max(1.0, float(pred))
            elif target == 'Average Speed':
                pred = max(0.0, float(pred))
                
            predictions[target] = round(pred, 2)
            
        return jsonify({
            "success": True,
            "predictions": predictions
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Prediction failed: {str(e)}"
        }), 400

@app.route('/api/reload', methods=['POST'])
def reload_models():
    # Reload model assets (in case model was retrained while server was running)
    load_assets()
    return jsonify({
        "success": True,
        "models_loaded": (pipelines is not None),
        "message": "Model assets reloaded successfully."
    })

if __name__ == '__main__':
    # Running Flask app on port 5001 in debug mode
    app.run(host='127.0.0.1', port=5001, debug=True)
