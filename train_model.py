import os
import json
import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, root_mean_squared_error, r2_score

def train_pipeline():
    print("Starting Model Training Pipeline...")
    
    # 1. Load raw dataset
    csv_path = "Banglore_traffic_Dataset_raw.csv"
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Dataset not found at {csv_path}")
        
    df = pd.read_csv(csv_path)
    print(f"Dataset loaded successfully. Shape: {df.shape}")
    
    # 2. Data Cleaning & Feature Engineering
    # Convert Date to datetime and extract temporal features
    df['Date'] = pd.to_datetime(df['Date'])
    df['Day_of_Week'] = df['Date'].dt.dayofweek
    df['Month'] = df['Date'].dt.month
    
    # Define features
    categorical_cols = ['Area Name', 'Road/Intersection Name', 'Weather Conditions', 'Roadwork and Construction Activity']
    numeric_cols = ['Traffic Volume', 'Incident Reports', 'Pedestrian and Cyclist Count', 'Day_of_Week', 'Month']
    
    targets = ['Congestion Level', 'Average Speed', 'Travel Time Index', 'Road Capacity Utilization']
    
    X = df[categorical_cols + numeric_cols]
    Y = df[targets]
    
    print("\nFeatures:")
    print(f"Categorical: {categorical_cols}")
    print(f"Numeric: {numeric_cols}")
    print(f"Targets: {targets}")
    
    # 3. Split into Train & Test sets
    X_train, X_test, Y_train, Y_test = train_test_split(X, Y, test_size=0.2, random_state=42)
    print(f"\nTrain size: {X_train.shape[0]}, Test size: {X_test.shape[0]}")
    
    # 4. Create Preprocessing Pipeline
    categorical_transformer = Pipeline(steps=[
        ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
    ])
    
    numeric_transformer = Pipeline(steps=[
        ('scaler', StandardScaler())
    ])
    
    preprocessor = ColumnTransformer(
        transformers=[
            ('cat', categorical_transformer, categorical_cols),
            ('num', numeric_transformer, numeric_cols)
        ]
    )
    
    # Create directory for model assets
    assets_dir = "model_assets"
    os.makedirs(assets_dir, exist_ok=True)
    
    # 5. Train & Evaluate separate models for each target variable
    pipelines = {}
    metrics = {}
    feature_importances = {}
    
    # First fit the preprocessor on training data to get transformed feature names for feature importance
    preprocessor.fit(X_train)
    cat_encoder = preprocessor.named_transformers_['cat'].named_steps['onehot']
    cat_features = list(cat_encoder.get_feature_names_out(categorical_cols))
    all_feature_names = cat_features + numeric_cols
    
    for target in targets:
        print(f"\nTraining model for: {target}...")
        
        # Build individual pipeline
        model_pipeline = Pipeline(steps=[
            ('preprocessor', preprocessor),
            ('regressor', RandomForestRegressor(n_estimators=100, max_depth=15, min_samples_split=4, random_state=42, n_jobs=-1))
        ])
        
        # Fit model
        model_pipeline.fit(X_train, Y_train[target])
        pipelines[target] = model_pipeline
        
        # Predict & Evaluate
        y_pred = model_pipeline.predict(X_test)
        mae = mean_absolute_error(Y_test[target], y_pred)
        rmse = root_mean_squared_error(Y_test[target], y_pred)
        r2 = r2_score(Y_test[target], y_pred)
        
        metrics[target] = {
            "MAE": round(float(mae), 4),
            "RMSE": round(float(rmse), 4),
            "R2": round(float(r2), 4)
        }
        print(f"[{target}] MAE: {mae:.4f}, RMSE: {rmse:.4f}, R2 Score: {r2:.4f}")
        
        # Extract Feature Importance
        importances = model_pipeline.named_steps['regressor'].feature_importances_
        
        # Group feature importances back to original columns
        grouped_importances = {
            'Area Name': 0.0,
            'Road/Intersection Name': 0.0,
            'Weather Conditions': 0.0,
            'Roadwork and Construction Activity': 0.0,
            'Traffic Volume': 0.0,
            'Incident Reports': 0.0,
            'Pedestrian and Cyclist Count': 0.0,
            'Day of Week': 0.0,
            'Month': 0.0
        }
        
        for name, imp in zip(all_feature_names, importances):
            if name.startswith('Area Name_'):
                grouped_importances['Area Name'] += imp
            elif name.startswith('Road/Intersection Name_'):
                grouped_importances['Road/Intersection Name'] += imp
            elif name.startswith('Weather Conditions_'):
                grouped_importances['Weather Conditions'] += imp
            elif name.startswith('Roadwork and Construction Activity_'):
                grouped_importances['Roadwork and Construction Activity'] += imp
            elif name == 'Traffic Volume':
                grouped_importances['Traffic Volume'] += imp
            elif name == 'Incident Reports':
                grouped_importances['Incident Reports'] += imp
            elif name == 'Pedestrian and Cyclist Count':
                grouped_importances['Pedestrian and Cyclist Count'] += imp
            elif name == 'Day_of_Week':
                grouped_importances['Day of Week'] += imp
            elif name == 'Month':
                grouped_importances['Month'] += imp
                
        # Round importances
        grouped_importances = {k: round(float(v) * 100, 2) for k, v in grouped_importances.items()}
        feature_importances[target] = grouped_importances
    
    # Save the models
    pipeline_path = os.path.join(assets_dir, "traffic_pipelines.joblib")
    joblib.dump(pipelines, pipeline_path)
    print(f"\nSaved all model pipelines to {pipeline_path}")
    
    # Save the metrics
    metrics_path = os.path.join(assets_dir, "metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=4)
    print(f"Saved evaluation metrics to {metrics_path}")
    
    # Save feature importances
    importances_path = os.path.join(assets_dir, "feature_importances.json")
    with open(importances_path, "w") as f:
        json.dump(feature_importances, f, indent=4)
    print(f"Saved feature importances to {importances_path}")
    
    # 6. Generate Data Summary and Aggregates for Dashboard
    print("\nGenerating aggregates and metadata for dashboard...")
    
    # Generate Area-Road Mapping
    area_road_map = {}
    for area in df['Area Name'].unique():
        roads = df[df['Area Name'] == area]['Road/Intersection Name'].unique().tolist()
        area_road_map[area] = sorted(roads)
        
    # Weather and Roadwork list
    weather_list = sorted(df['Weather Conditions'].unique().tolist())
    
    # Compute summary metrics (KPIs)
    total_records = len(df)
    avg_congestion = float(df['Congestion Level'].mean())
    avg_speed = float(df['Average Speed'].mean())
    total_incidents = int(df['Incident Reports'].sum())
    
    # Aggregate data for charts
    # A. Congestion by Weather
    congestion_by_weather = df.groupby('Weather Conditions')['Congestion Level'].mean().round(2).to_dict()
    
    # B. Speed by Weather
    speed_by_weather = df.groupby('Weather Conditions')['Average Speed'].mean().round(2).to_dict()
    
    # C. Average Speed by Area
    speed_by_area = df.groupby('Area Name')['Average Speed'].mean().round(2).to_dict()
    
    # D. Congestion by Day of Week
    congestion_by_day = df.groupby('Day_of_Week')['Congestion Level'].mean().round(2).to_dict()
    # Map index to day name
    day_map = {0: 'Monday', 1: 'Tuesday', 2: 'Wednesday', 3: 'Thursday', 4: 'Friday', 5: 'Saturday', 6: 'Sunday'}
    congestion_by_day = {day_map[k]: v for k, v in congestion_by_day.items()}
    
    # E. Roadwork impact (Congestion & Speed)
    roadwork_impact = df.groupby('Roadwork and Construction Activity')[['Congestion Level', 'Average Speed']].mean().round(2).to_dict()
    
    # F. Peak Traffic Hours (if we had time, but we only have Date. Let's look at volume vs congestion correlation)
    volume_bins = pd.cut(df['Traffic Volume'], bins=5)
    congestion_by_volume = df.groupby(volume_bins, observed=False)['Congestion Level'].mean().round(2).to_dict()
    # Format the interval keys for json compatibility
    congestion_by_volume = {f"{int(k.left)}-{int(k.right)}": v for k, v in congestion_by_volume.items()}
    
    summary_data = {
        "metadata": {
            "area_road_map": area_road_map,
            "weather_conditions": weather_list,
            "areas": sorted(list(area_road_map.keys()))
        },
        "kpis": {
            "total_records": total_records,
            "avg_congestion": round(avg_congestion, 2),
            "avg_speed": round(avg_speed, 2),
            "total_incidents": total_incidents
        },
        "charts": {
            "congestion_by_weather": congestion_by_weather,
            "speed_by_weather": speed_by_weather,
            "speed_by_area": speed_by_area,
            "congestion_by_day": congestion_by_day,
            "roadwork_impact": roadwork_impact,
            "congestion_by_volume": congestion_by_volume
        }
    }
    
    summary_path = os.path.join(assets_dir, "data_summary.json")
    with open(summary_path, "w") as f:
        json.dump(summary_data, f, indent=4)
    print(f"Saved dashboard data summary to {summary_path}")
    print("\nTraining and aggregation pipeline complete!")

if __name__ == "__main__":
    train_pipeline()